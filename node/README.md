# Unchained (Node)

## Helpful Docs

- [TSOA](https://tsoa-community.github.io/docs/)

## Project Structure

- `packages` - shared internal packages across coinstacks
- `coinstacks/common` - common coinstack logic to reduce duplication
- `coinstacks/{coin}` - coin specific logic
- `**/pulumi` - pulumi infrastructure logic for deployment

## Dependencies

- [Node.js](https://nodejs.org/en/)
  - [NVM](https://github.com/nvm-sh/nvm#installing-and-updating) \(recommended to install Node.js and npm\)
- [Yarn](https://classic.yarnpkg.com/en/docs/install)
- [OpenJDK 11](https://openjdk.java.net/install/) is required to generate the OpenAPI spec files

## Initial Setup

- Install [Node.js LTS](https://nodejs.org/en/)
  - (Optional) use nvm to automatically install the node version specified in `.nvmrc`
    ```sh
    nvm use
    ```
- Install [Yarn](https://classic.yarnpkg.com/en/docs/install)
  ```sh
  npm install --global yarn
  ```
- Install dependencies and build:
  ```sh
  yarn
  yarn build
  ```
  _Note: You MUST run `yarn build` or everything after this won't work_

- Copy sample config
  ```sh
  cp coinstacks/ethereum/sample.env coinstacks/ethereum/.env
  ```

- Get a free [Etherscan API key](https://etherscan.io/apis) and update `.env` file with the API key

- Start the reverse proxy and any common service (ex. hot reloading)
  ```sh
  docker-compose up -d
  ```
  _Note: `-d` runs the containers in the background. The first time you run you should not include `-d` so you can verify the containers work`_

- Start a coinstack API
  ```sh
  cd coinstacks/ethereum && docker-compose up api
  ```

Once running, the ethereum coinstack will be running at http://api.ethereum.localhost

