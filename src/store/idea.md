# What is important enough to qualify as an entity?

- User
  - id
  - session
  - username
  - nostrPubkey
  - password

- Match
  - id
  - state
  - ownerId
  - options
  - results
  - hasBet
  - ?latestHand

- MatchEvent
  - id
  - matchId
  - type // 'say' | 'use' | 'system'
  - eventJson // {}

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
  - paymentId
  - paymentType // 'BetParticipantHodlPayment' | ?

- BetParticipantHodlPayment
  - id
  - status
  - winInvoice
  - winPreimage
  - hodlInvoice
  - hodlPreimage 
