tx parse
debug: found registration document: [object Object], for address: bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28
worker-tx_1 | info: Address sync for: bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28, from: 700750, to: 701868 started
worker-tx_1 | debug: getTxHistory: bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28, from 700750 to 701868, page 1 out of 1 (1356 ms)
worker-tx_1 | info: Address sync for: bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28, from: 700750, to: 701868 finished (4275 ms)
worker-address_1 | info: publishing tx: 6180934b33620e1b2f6114fa243933b7f71c53a30e4f6c047c7ba195b76a2620 for registered address: bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28 to client: unchained
worker-address_1 | debug: getTransaction: 6180934b33620e1b2f6114fa243933b7f71c53a30e4f6c047c7ba195b76a2620, for address: bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28
worker-address_1 | debug: getTransaction: b216ba9b329830c2e1b06a76c1cb962e93b7e063606d5e3f0c5ce177ba2f2918, for address: bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28
worker-address_1 | info: publishing tx: b216ba9b329830c2e1b06a76c1cb962e93b7e063606d5e3f0c5ce177ba2f2918 for registered address: bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28 to client: unchained

register an address

publish this to the registry exchange:

2 transactions
bc1qulv9frl39h5nxzaw76cumq32q32kzsux4f2cgr2krkyd5x7ltcxq8t8h4j

{
"action": "register",
"client_id": "unchained",
"registration": {
"addresses": ["bc1qulv9frl39h5nxzaw76cumq32q32kzsux4f2cgr2krkyd5x7ltcxq8t8h4j"]
}
}

block 700747
{
"action": "register",
"client_id": "unchained",
"registration": {
"addresses": ["bc1q5f7l3h4feve5a6nx86jv6w9s66k90z4f25daha"]
}
}

curl -d '{"id":"1", "jsonrpc":"2.0", "method":"eth_sendRawTransaction", "params":["0x02f86d0101820400820400825a3c94fc0cc6e85dff3d75e3985e0cb83b090cfd498dd1876a94d74f43000080c080a002c6ff8191a064cd00d3bdc2de16d12c85d23e9e5780d991dc3d7e93b75d68daa04ec17ff9c0d65d816e2a6e511b53fb0d3a4d34fbf81e12573e80b1a59a42d620"]}' -H 'Content-Type: application/json' https://ethereum.cointainers.prod.chiefhappinessofficerellie.org

curl -d '{"id":"1", "jsonrpc":"2.0", "method":"eth_sendRawTransaction", "params":["0x02f86d0101820400820400825a3c94fc0cc6e85dff3d75e3985e0cb83b090cfd498dd1876a94d74f43000080c080a002c6ff8191a064cd00d3bdc2de16d12c85d23e9e5780d991dc3d7e93b75d68daa04ec17ff9c0d65d816e2a6e511b53fb0d3a4d34fbf81e12573e80b1a59a42d620"]}' -H 'Content-Type: application/json' https://ethereum.cointainers.prod.chiefhappinessofficerellie.org

curl -d '{"jsonrpc": "1.0", "id": "curltest", "method": "getblockcount", "params": []}' -H 'Content-Type: application/json' https://bitcoin.cointainers.stage.chiefhappinessofficerellie.org

curl --user user -d '{"jsonrpc": "1.0", "id": "curltest", "method": "getblockchaininfo", "params": []}' -H 'Content-Type: application/json' https://bitcoin.cointainers.stage.chiefhappinessofficerellie.org

curl -d '{"jsonrpc": "1.0", "id": "curltest", "method": "getblockchaininfo", "params": []}' -H 'Content-Type: application/json' https://user:hunter2@bitcoin.cointainers.stage.chiefhappinessofficerellie.org

curl -d '{"jsonrpc": "1.0", "id": "curltest", "method": "getblock", "params": ["00000000000000000000aa081b5c52c9c20d5d757db1bb339d907fbd168a6d26"]}' -H 'Content-Type: application/json' https://user:hunter2@bitcoin.cointainers.stage.chiefhappinessofficerellie.org

curl -d '{"jsonrpc": "1.0", "id": "curltest", "method": "getblockhash", "params": [700743]}' -H 'Content-Type: application/json' https://user:hunter2@bitcoin.cointainers.stage.chiefhappinessofficerellie.org

000000000000000000070f009bf24765b1117f842ba7b1441b0bbeedcb62e7da
