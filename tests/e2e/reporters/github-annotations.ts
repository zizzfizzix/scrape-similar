import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import path from 'path'

/**
 * GitHub Actions annotation reporter that ignores retried-and-passed attempts.
 *
 * Playwright's built-in `github` reporter annotates every failed *attempt*,
 * flaky ones included, so a run that ends green still paints red `##[error]`
 * markers inline on the PR diff - on code that has nothing to do with the test
 * that flaked. This reporter annotates only tests that actually ended up
 * failing; flaky ones are reported once in the run summary, where they inform
 * without marking up the diff.
 *
 * Failure details for both still reach the log through the `list` reporter that
 * runs alongside this one.
 */

/** Annotations render as plain text, so terminal colouring only adds noise. */
const stripAnsiEscapes = (value: string) => value.replace(/\u001B\[[0-9;]*m/g, '')

/** Escapes a workflow-command payload. */
const escapeData = (value: string) =>
  stripAnsiEscapes(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

/** Escapes a workflow-command property, which additionally reserves `:` and `,`. */
const escapeProperty = (value: string) =>
  escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C')

interface AnnotationProperties {
  file?: string
  line?: number
  col?: number
  title?: string
}

const log = (type: 'error' | 'notice', message: string, properties: AnnotationProperties = {}) => {
  const serialized = Object.entries(properties)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${escapeProperty(String(value))}`)
    .join(',')
  process.stdout.write(`::${type}${serialized ? ` ${serialized}` : ''}::${escapeData(message)}\n`)
}

const workspaceRelativePath = (filePath: string) =>
  path.relative(process.env.GITHUB_WORKSPACE ?? process.cwd(), filePath)

const formatTestTitle = (test: TestCase) => test.titlePath().filter(Boolean).join(' › ')

export default class GitHubAnnotationsReporter implements Reporter {
  private readonly flakyTests: string[] = []

  /** The `list` reporter owns stdout; this one only emits workflow commands. */
  printsToStdio() {
    return false
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // onTestEnd fires once per attempt, and the outcome only settles once no
    // retry is left - so skip attempts that are about to be retried.
    const willRetry = test.outcome() === 'unexpected' && test.results.length <= test.retries
    if (willRetry) return

    if (test.outcome() === 'flaky') {
      this.flakyTests.push(formatTestTitle(test))
      return
    }
    if (test.outcome() !== 'unexpected') return

    const title = formatTestTitle(test)
    for (const error of result.errors) {
      const location = error.location ?? test.location
      log('error', [title, error.message ?? error.value ?? 'Test failed'].join('\n\n'), {
        file: workspaceRelativePath(location.file),
        line: location.line,
        col: location.column,
        title,
      })
    }
  }

  onEnd() {
    if (!this.flakyTests.length) return
    // No `file`, so this never lands on the PR diff.
    log('notice', ['Passed on retry:', ...this.flakyTests].join('\n'), {
      title: `🎭 ${this.flakyTests.length} flaky test${this.flakyTests.length === 1 ? '' : 's'}`,
    })
  }
}
