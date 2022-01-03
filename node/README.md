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
  yarn && yarn build
  ```
