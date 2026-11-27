import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { afterEach, describe, it, mock } from 'node:test'
import { flushAndExit } from '../process'

describe('flushAndExit', () => {
  afterEach(() => mock.restoreAll())

  it('exits after pending writes have flushed', async () => {
    const order: Array<string> = []
    const exit = mock.method(process, 'exit', ((code: number) => order.push(`exit:${code}`)) as never)

    const slow = new Writable({
      highWaterMark: 1,
      write(chunk, _, cb) {
        setTimeout(() => {
          order.push(`write:${chunk.toString() || '<flush>'}`)
          cb()
        }, 20)
      },
    })

    slow.write('fatal')
    flushAndExit(1, [slow])

    assert.deepEqual(order, [])
    await new Promise((resolve) => setTimeout(resolve, 100))

    assert.deepEqual(order, ['write:fatal', 'write:<flush>', 'exit:1'])
    assert.equal(exit.mock.callCount(), 1)
  })

  it('exits after the timeout if a stream never drains', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const exit = mock.method(process, 'exit', (() => undefined) as never)
    const stuck = new Writable({ write: () => undefined })

    flushAndExit(1, [stuck])
    assert.equal(exit.mock.callCount(), 0)

    mock.timers.tick(1000)
    assert.equal(exit.mock.callCount(), 1)
    assert.deepEqual(exit.mock.calls[0].arguments, [1])
    mock.timers.reset()
  })
})
