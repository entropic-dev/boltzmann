# Example typescript project

This project gives you the random cat names you didn't realize you needed, implemented in TypeScript.
`npm start` to run the project, then visit either of the two provided endpoints to get the name of your
next cat:

```shell
❯ npm run boltzmann:routes

> typed@1.0.0 boltzmann:routes /Users/cj/code/personal/boltzmann/examples/typed
> B=1 node -r ts-node/register -e 'require("./boltzmann").printRoutes()'

  GET /fancy-name fancy  (./handlers.ts:10:21)
  GET /name       plain  (./handlers.ts:17:21)

(hold ⌘ and click on any filename above to open in VSCode)
```
