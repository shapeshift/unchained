# Unchained API Client

Provides a typescript axios client to interact with all supported unchained API's

## Installing

Using npm:
```
npm install @shapeshiftoss/unchained-client
```

Using yarn:
```
yarn add @shapeshiftoss/unchained-client
```

## Usage

```
import { Ethereum } from '@shapeshiftoss/unchained-client'

const config = new Ethereum.Configuration({ basePath: 'https://api.ethereum.shapeshift.com' })
const ethClient = new Ethereum.V1Api(config)

const { data } = await ethClient.getBalance({ pubkey: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa' })
```