# Cosmos SDK chain support in Unchained
Add support for cosmos and cosmos-sdk chains

## Tech
- golang v1.17

## Running
- Install golang
- Copy sample.launch.json to .vscode and update with any keys etc
- cmd/cosmos is main for Cosmos
- cmd/osmosis is main for Osmosis

## Design
- The core functionality of chains like Osmosis and Thorchain is identical to Cosmos
- We can write the Cosmos SDK implementation once, and provide mechanisms to inject chain specific behavior (additional protos, support for custom messages and event logs, custom API routes etc)

