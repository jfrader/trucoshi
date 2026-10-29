import { expect } from "chai"
import * as sinon from "sinon"
import { accountsApi } from "../../src/accounts/client"
import { ITrucoshi, Trucoshi, UserSession } from "../../src/server/classes"
import { Chat } from "../../src/server/classes/Chat"
import { EMatchState } from "../../src/types"
import logger from "../../src/utils/logger"

describe("Bet refund cleanup", () => {
  let server: ITrucoshi

  beforeEach(() => {
    server = Trucoshi({ port: 0, serverVersion: "refund-cleanup-test" })
    server.chat = Chat(server.io, server.tables)
    sinon.stub(accountsApi.instance, "request").rejects(new Error("Unexpected HTTP request"))
    sinon.stub(accountsApi.wallet, "getPayRequest").resolves({
      data: { paid: true, amountInSats: 10 },
    } as never)
    sinon.stub(accountsApi.users, "getUserWallet").resolves({
      data: { balanceInSats: 100 },
    } as never)
    sinon.stub(accountsApi.wallet, "payUser").resolves({} as never)
  })

  afterEach(async () => {
    server.store = undefined
    await server.close()
    sinon.restore()
  })

  const fixture = (accountId: number | null = 42) => {
    const player = { id: 7, matchId: 2, accountId, satsPaid: 10, payRequestId: 11 }
    const rows = new Map([[player.id, { ...player }]])
    const bet = { id: 3 }
    const tx = {
      matchPlayer: {
        findUnique: sinon.stub().callsFake(async ({ where }) => rows.get(where.id)),
        update: sinon.stub().callsFake(async ({ where, data }) => {
          Object.assign(rows.get(where.id)!, data)
        }),
        delete: sinon.stub().callsFake(async ({ where }) => rows.delete(where.id)),
        findMany: sinon.stub().callsFake(async () => [...rows.values()]),
      },
      matchBet: {
        findUnique: sinon.stub().resolves(bet),
        update: sinon.stub().resolves({}),
        delete: sinon.stub().resolves({}),
      },
      match: {
        findUnique: sinon.stub().callsFake(async () => ({ players: [...rows.values()], bet })),
        delete: sinon.stub().callsFake(async () => {
          if (rows.size) throw new Error("MatchPlayer foreign key prevents match deletion")
        }),
      },
    }
    const transaction = sinon.stub().callsFake(async (operation) => operation(tx))
    server.store = { ...tx, $transaction: transaction } as never
    const table = {
      matchId: 2,
      matchSessionId: "refund-cleanup-test",
      log: logger,
      state: () => EMatchState.UNREADY,
      playing: () => false,
      getPublicMatchInfo: () => ({}),
      lobby: { options: { satsPerPlayer: 10 }, players: [], playAgainRequest: null },
    }
    return { player, rows, tx, transaction, table }
  }

  it("deletes a refunded player before checking whether all players left", async () => {
    const { player, rows, tx, transaction, table } = fixture()

    await server.deletePlayerAndReturnBet(table as never, player as never)

    expect(transaction.callCount).to.equal(1)
    expect(rows.size).to.equal(0)
    sinon.assert.calledOnceWithMatch(accountsApi.wallet.payUser as sinon.SinonStub, {
      userId: 42,
      amountInSats: 10,
    })
    sinon.assert.calledOnceWithExactly(tx.matchBet.update, {
      where: { id: 3 },
      data: { refunded: true },
    })
  })

  it("cleans up paid players and their match in the same transaction", async () => {
    const { rows, tx, transaction, table } = fixture()
    sinon.stub(server, "getTableSockets").resolves()
    const cleanupError = sinon.stub(logger, "error")

    await server.cleanupMatchTable(table as never)

    expect(transaction.callCount).to.equal(1)
    expect(rows.size).to.equal(0)
    sinon.assert.calledOnce(tx.match.delete)
    sinon.assert.calledOnce(tx.matchBet.delete)
    sinon.assert.callOrder(tx.matchPlayer.delete, tx.matchBet.delete, tx.match.delete)
    sinon.assert.notCalled(cleanupError)
  })

  it("removes an accountless row without attempting a refund", async () => {
    const { player, rows, table } = fixture(null)

    await server.deletePlayerAndReturnBet(table as never, player as never)

    expect(rows.size).to.equal(0)
    sinon.assert.notCalled(accountsApi.wallet.payUser as sinon.SinonStub)
  })

  it("already refunds a forced pre-start leave while other players remain", async () => {
    const { rows, table } = fixture()
    const session = UserSession("player-session", "Player", "session-token")
    session.setAccount({ id: 42, name: "Player" } as never)
    server.sessions.set(session.session, session)
    const player = {
      session: session.session,
      matchPlayerId: 7,
      getPublicPlayer: () => ({}),
    }
    const removePlayer = sinon.stub().resolves({ isEmpty: () => false })
    const matchTable = {
      ...table,
      isSessionPlaying: () => player,
      playerDisconnected: sinon.stub(),
      lobby: { ...table.lobby, removePlayer },
    }
    server.tables.set(table.matchSessionId, matchTable as never)
    const cleanup = sinon.stub(server, "cleanupMatchTable").resolves()

    await server.leaveMatch(
      table.matchSessionId,
      { id: "player-socket", data: { user: { session: session.session } } } as never,
      true
    )

    sinon.assert.calledOnce(accountsApi.wallet.payUser as sinon.SinonStub)
    sinon.assert.calledOnce(removePlayer)
    sinon.assert.notCalled(cleanup)
    expect(rows.size).to.equal(0)
  })
})
