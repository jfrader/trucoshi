# What is important enough to qualify as an entity?

- User
    - id
    - session
    - username
    - nostrPubkey
    - password

- Match
    - id
    - ownerId
    - options
    - results

- MatchEvent
    - id
    - matchId
    - type
    - event

- MatchBet
    - id
    - matchId
    - betStakeInSats
    - status

- BetParticipant
    - id
    - betId
    - userId
    - userStakeInSats
    - winInvoice
    - winPreimage
    - hodlInvoice
    - hodlPreimage
