# API Load Testing with Vegeta

Documentation: [https://github.com/tsenart/vegeta](https://github.com/tsenart/vegeta)

## Requirements

- Mac: `brew install vegeta`
- Golang: `go get -u github.com/tsenart/vegeta`

_optionally: increase your system's file descriptor limit `ulimit -n {new-limit}` and threads limit `ulimit -u {new-limit}` to be able to run more tests concurrently_

## Usage

- Run API Load Attack

```sh
vegeta attack -duration=1m -rate=500 -timeout=60s -targets=./targets.txt -output=results.bin
```

- View report details

```sh
vegeta report results.bin
```

- View report histogram

```sh
vegeta report -type="hist[100ms, 250ms, 500ms, 1000ms]" results.bin
```

- Create and view plot graph

```sh
cat results.bin | vegeta plot > plot.html
google-chrome plot.html
```
