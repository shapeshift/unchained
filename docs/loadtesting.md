# API Load Testing with Vegeta

Documentation: https://github.com/tsenart/vegeta

### REQUIREMENTS

- Mac: `brew install vegeta`
- Golang: `go get -u github.com/tsenart/vegeta`

_optionally: increase your system's file descriptor limit `ulimit -n {new-limit}` and threads limit `ulimit -u {new-limit}` to be able to run more tests concurrently_

### USAGE

- Run API Load Attack

```bash
vegeta attack -duration=1m -rate=500 -timeout=60s -targets=./targets.txt -output=results.bin
```

- View report details

```bash
vegeta report results.bin
```

- View report histogram

```bash
vegeta report -type="hist[100ms, 250ms, 500ms, 1000ms]" results.bin
```

- Create and view plot graph

```bash
cat results.bin | vegeta plot > plot.html
google-chrome plot.html
```
