todo - get to deployable state

broadcast tx input
{"broadcastTx": {"address": "thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms", "amount": "1.1574026397610762", "symbol": "RUNE", "tx": "

{
"tx":{
"memo":"",
"fee":{
"amount":[{"amount":"0","denom":"rune"}],
"gas":"650000"},
"msg":[{"type":"thorchain/MsgSend","value":{"amount":[{"amount":"12706267","denom":"rune"}],"from_address":"thor1cdpznmwtpz3qt9t4823rkg5wamhq7df28qu69z",
"to_address":"thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms"
}}],
"signatures":[{
"signature":"uzZ5dgJVMjOK6BZHslK6cfdB3wD9IrG9wt+BcGQhoiUg2+JpT4IPQoTK0RBUqcQaq67gQ7uvbTa/S9xQmjRzSg==",
"pub_key":{"type":"tendermint/PubKeySecp256k1","value":"ArvUYSkr8N00d1gcsnhRrSaC0B8SOxz+AISWo5I1ZJnJ"}
}]
},
"mode":"sync",
"type":"cosmos-sdk/StdTx"}"
}
}

rest endpt response
{
"error": "this transaction cannot be broadcasted via legacy REST endpoints, because it does not support Amino serialization. Please either use CLI, gRPC, gRPC-gateway, or directly query the Tendermint RPC endpoint to broadcast this transaction. The new REST endpoint (via gRPC-gateway) is POST /cosmos/tx/v1beta1/txs. Please also see the REST endpoints migration guide at https://docs.cosmos.network/master/migrations/rest.html for more info"
}

from coinainer logs

│ midgard 2021-10-05T19:44:42Z INF THORNode REST URL is set to "http://thor-thornode:1317/thorchain" │
│ midgard 2021-10-05T19:44:42Z INF Tendermint RPC URL is set to "http://thor-thornode:27147/websocket"
