# Release Process

## 1) Version
- Checkout develop
    ```sh
    git checkout develop && git pull origin develop
    ```
- View latest version tag
    ```sh
    git tag | tail -n1
    ```
- Create version branch according to semvar conventions
    ```sh
    git branch -b version-vX.X.X
    ```
- Bump version to match branch version name. This will automatically bump
  all of the packages and create the version tag.
    ```sh
    cd node && yarn version:(major|minor|patch)
    ```
- Push version branch and open GitHub PR merging version branch -> develop
    ```sh
    git push origin version-vX.X.X
    ```
- Push version tag
    ```sh
    git push origin vX.X.X
    ```
- Review, merge and ensure successful deploy to dev environment in CircleCI

## 2) Release
- Checkout develop
    ```sh
    git checkout develop && git pull origin develop
    ```
- Create release branch
    ```sh
    git branch -b release-vX.X.X
    ```
- Push release branch and open GitHub PR merging release branch -> main
    ```sh
    git push origin release-vX.X.X
    ```
- Review, merge, and ensure successful deploy to public environment in CircleCI

## 3) Unify
- Checkout main
    ```sh
    git checkout main && git pull origin main
    ```
- Checkout develop
    ```sh
    git checkout develop && git pull origin develop
    ```
- Merge main -> develop
    ```sh
    git merge main && git push origin develop
    ```
