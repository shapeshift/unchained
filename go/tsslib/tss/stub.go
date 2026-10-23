package tss

// Thornode v3.19+ requires the private tss-lib-private module. Its packages that Unchained imports only use
// MessageRouting as a field type on bifrost p2p wire messages, which Unchained never builds or reads.

type PartyID struct {
	Id      string
	Moniker string
	Key     []byte
	Index   int
}

type MessageRouting struct {
	From                    *PartyID
	To                      []*PartyID
	IsBroadcast             bool
	IsToOldCommittee        bool
	IsToOldAndNewCommittees bool
}
