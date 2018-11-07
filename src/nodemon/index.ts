import path from 'path'
import { ChildProcess, spawn } from 'child_process'

import program from 'commander'
import colors from 'colors'
import chokidar from 'chokidar'
import treeKill from 'tree-kill'
import emoji from 'node-emoji'

import { fromEvent, merge } from 'rxjs'
import {
  map,
  filter,
  switchMap,
  tap,
  startWith,
  debounceTime,
  takeUntil,
  reduce,
} from 'rxjs/operators'

const is = (val: any) => Object.is.bind(Object, val)

const not = (result: any) => !Boolean(result)

const message = (content: string, color: string) => {
  const msg = emoji.emojify(content)

  if (colors[color]) {
    return colors[color](msg)
  }

  return msg
}

const parsers = {
  int: (number: string) => parseInt(number, 10),
  float: (number: string) => parseFloat(number),
  list: (val: string) => val.split(','),
  collect: (val, memo) => {
    memo.push(val)

    return memo
  },
}

const kill = (process: ChildProcess, signal: string) =>
  new Promise((resolve, reject) =>
    treeKill(process.pid, signal, (error) => {
      if (error) {
        return reject(error)
      }

      return resolve()
    }),
  )

const createScriptExec = (script: string) => {
  let instance = null

  return async function execute() {
    if (instance) {
      await kill(instance, 'SIGKILL')
    }

    instance = spawn(script, [], { shell: true })

    return merge<String, String>(
      fromEvent(instance.stderr, 'data').pipe(
        map((data) => message(data.toString(), 'red')),
      ),
      fromEvent(instance.stdout, 'data').pipe(
        map((data) => message(data.toString(), 'cyan')),
      ),
    ).pipe(takeUntil(fromEvent(instance, 'close')))
  }
}

const parseArguments = (execution: program.Command) => {
  const { ext = [], watch = [], ignore = [], delay = 0, exe } = execution

  if (!exe) {
    throw new Error('No script provided')
  }

  return {
    delay,
    extensions: ext.map((e) => `.${e}`),
    watchedDirectories: watch,
    ignoredDirectories: [...ignore, 'node_modules', 'build'],
    shouldWatchEveryDirectory: not(watch.length),
    shouldWatchEveryExtension: not(ext.length),
    script: exe,
  }
}

const isInDirectory = (directories: string[]) => (filePath: string) =>
  directories.some(filePath.startsWith.bind(filePath))

const isExpectedExtension = (extensions: string[]) => (extension: string) =>
  extensions.some(is(extension))

const watch = () => {
  const commandArguments = program
    .version('1.0.0')
    .option('-e, --ext <items>', 'Extensions to watch', parsers.list)
    .option('-w, --watch <items>', 'Directories to watch', parsers.list)
    .option('-i, --ignore <items>', 'Directories to ignore', parsers.list)
    .option('-d, --delay <n>', 'Delay before the execution', parsers.int)
    .option('-x, --exe <script>', 'Execute script on restart')
    .parse(process.argv)

  const {
    script,
    shouldWatchEveryDirectory,
    shouldWatchEveryExtension,
    ignoredDirectories,
    watchedDirectories,
    extensions,
    delay,
  } = parseArguments(commandArguments)

  const executeScript = createScriptExec(script)
  const shouldPathBeIgnored = isInDirectory(ignoredDirectories)
  const shouldPathBeWatched = isInDirectory(watchedDirectories)
  const shouldExtensionBeWatched = isExpectedExtension(extensions)

  return fromEvent(chokidar.watch(process.cwd()), 'all')
    .pipe(
      debounceTime(delay || 1000),
      map(([event, filePath]: string[]) => {
        const filename = path.basename(filePath)
        const extension = path.extname(filename)

        debugger

        return {
          event,
          filename,
          extension,
          filePath: filePath.slice(process.cwd().length + 1),
        }
      }),
      filter(
        ({ filePath, extension }) =>
          (shouldWatchEveryDirectory || shouldPathBeWatched(filePath)) &&
          (shouldWatchEveryExtension || shouldExtensionBeWatched(extension)) &&
          not(shouldPathBeIgnored(filePath)),
      ),
      tap(() => console.log(message('Restarting...', 'green'))),
      startWith(null),
      switchMap(executeScript),
      tap(() => console.log(message('Executing...', 'green'))),
      switchMap((obsvr) => {
        return obsvr.pipe(
          tap(console.log),
          reduce(() => null),
        )
      }),
      tap(() => console.log(message('Finished! :fire:', 'green'))),
    )
    .subscribe()
}

export { watch }
