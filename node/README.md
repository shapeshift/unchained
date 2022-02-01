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
- [Yarn](https://classic.yarnpkg.com/en/docs/install) - package management
- [OpenJDK 11](https://openjdk.java.net/install/) - required for [openapi-generator-cli](https://openapi-generator.tech/docs/usage#generate) to generate api clients from OpenAPI specs

## Initial Setup

- Any commands should be run from within `unchained/node`

- Install [Node.js LTS](https://nodejs.org/en/)

  - (Optional) use nvm to automatically install the node version specified in `.nvmrc`

    ```sh
    nvm use
    ```

- Install [Yarn](https://classic.yarnpkg.com/en/docs/install)

  ```sh
  npm install --global yarn
  ```

- Install dependencies:

  ```sh
  yarn
  ```

- Build project:

  ```sh
  yarn build
  ```

  **_build step must be run locally before attempting to `docker-compose up`_**

- Copy sample env file:

  ```sh
  cp coinstacks/ethereum/sample.env coinstacks/ethereum/.env
  ```

- Fill out any missing variables
  - Create an [Etherscan Account](https://etherscan.io/apis) for a free API key
