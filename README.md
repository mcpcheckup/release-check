# MCP Checkup Release Check

A GitHub Action that observes an MCP server from your own runner, before you release it. It writes what it saw to the job summary, to a pull request comment and to a JSON file.

Everything it reports was observed in your runner and is unsigned. It is not an MCP Checkup attestation, it gives no score and no verdict. It needs no MCP Checkup account, and it sends nothing to MCP Checkup. [Simplified Chinese](README.zh.md)

## Use it

```yaml
name: Release Check
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  release-check:
    runs-on: ubuntu-latest
    steps:
      - id: check
        uses: mcpcheckup/release-check@main
        with:
          url: https://staging.example.com/mcp
      - uses: actions/upload-artifact@v4
        with:
          name: release-check-observation
          path: ${{ steps.check.outputs.observation-file }}
```

The same workflow is in `examples/release-check.yml`. Pin the Action to a release tag or a full commit SHA once the repository publishes them. The Action writes the JSON file; keeping it as an artifact is the `upload-artifact` step above.

## Inputs

| Input | Required | Default | Meaning |
| --- | --- | --- | --- |
| `url` | `url` or `command` | | The MCP endpoint of a server that is already running: http or https, with no user name or password. Its query string is sent as given, and is never printed or stored. |
| `command` | `url` or `command` | | A server for the Action to start in the runner, as a JSON array without a shell: the program first, then its arguments, for example `["node", "server.js"]`. See "Stdio mode". Give `url` or `command`, not both. |
| `env-names` | no | | With `command` only: the names, separated by commas or line breaks, of the environment variables of the job that the started server receives. The Action never prints or stores these values. If the server itself puts a value into an answer (for example into a tool name), it is kept as part of that answer. |
| `comment` | no | `true` | Post one comment on the pull request, and update it on re-runs. `false` writes only the job summary and the JSON file. |
| `github-token` | no | `${{ github.token }}` | The runner's own token. It is used only for the requests to GitHub described under "Requests to GitHub", and is never sent to the server being observed. |
| `output-file` | no | `release-check-observation.json` | Where the JSON file is written, as a path inside the workspace. |

Outputs: `observation-file`, `scope`, `protocol-revision`, `tool-count`, `toolset-fingerprint` and `schema-fingerprint`.

## Stdio mode

With `command`, the Action starts your server in the runner and runs the same checks against it over its standard input and output. No network request is made to it.

```yaml
      - id: check
        uses: mcpcheckup/release-check@main
        with:
          command: '["node", "dist/server.js"]'
          env-names: |
            MY_SERVER_CONFIG
```

- `command` is a JSON array of strings, the program first and then its arguments. It is started without a shell, in the workspace.
- The server receives the variables named in `env-names` and `PATH`, `HOME`, `USERPROFILE`, `TMPDIR`, `TEMP`, `TMP`, `SystemRoot` and `LANG`. It receives nothing else from the job's environment, so not the GitHub token. A name in `env-names` that is not set in the job is an error.
- The JSON file carries `launch_config_digest`: a `sha256:` digest made of a hash of each element of `command` and, for each name in `env-names`, the name and a hash of its value. No value and no argument is printed or stored by the Action, and the eight variables above are not part of the digest. A hash of a short or guessable value can be recovered by trying candidates, so if a named variable holds a short secret, do not upload the JSON file as an artifact in a public repository.
- What the server writes is never shown. Its standard output is read only to find the answers to the Action's requests and everything else on it is dropped unread, and its standard error is discarded. What is kept of the answers themselves is the same as for any server: the JSON file has the tool names, and "What it never does" lists the rest.
- The requests are the ones listed under "Every request the Action sends to your server", written as one JSON message per line; a notification gets no answer.
- Limits: 30 seconds from the start to the first answer, 15 seconds for each handshake message after it, 10 seconds for each later request, 90 seconds in total, and 2 MiB for one line. When a limit is reached, or the server exits early or cannot be started, the "Server process" row of the summary says so, the JSON file records it in `process`, and the Action kills the server's process tree. A process that is no longer part of that tree, for example one that detached itself, is not stopped by the Action, and the Action does not wait for it or for any pipe it still holds. On a Windows runner, if the process the Action started exits first, processes it started may be left running; the Action does not find or stop them.
- The summary says "The checks that observe an HTTP endpoint (reachability, redirects, transport type, authorization metadata, TLS and latency) are not reported for a server on stdio." They are `reachability`, `redirect_policy`, `transport_type`, `auth_metadata`, `tls_certificate` and `latency_profile`.

## What you get

- **Job summary.** A table headed "Observed in this runner · unsigned": the protocol revision the server declared, the number of tools, the toolset and schema fingerprints, and one row per check.
- **Pull request comment.** The same content. It carries a hidden marker, so a re-run updates the earlier comment that carries its marker and does not post another. On a pull request from a fork the runner's token is read-only: the comment is then skipped with a warning, and the job summary still has the result.
- **JSON file.** The protocol revision, the tool names with a fingerprint for each tool, the toolset and schema fingerprints, and every check's state with its reason. It is meant to be compared with a later observation.

## The checks, and what the job does with them

The checks are the MCP Checkup check suite, run from your runner. Each one reports one of four states, with a reason: VERIFIED, FAILED, OBSERVED_RISK or UNVERIFIED. They are never combined into a score or a verdict. Latency and error-shape are measured from your runner, not from MCP Checkup's own probe. When the tool list was read in full, the two checks that compare the tool list with an approved baseline, `toolset_unchanged_vs_approved` and `schema_unchanged_vs_approved`, are reported UNVERIFIED with the reason "Not compared: this Action does not read a baseline." Otherwise these rows carry the reason the tool list, or its fingerprint, was not available.

The policy is neutral: the job does not fail because of what the server answered. It fails only when the Action itself cannot run, for example when `url` is missing or is not a valid URL.

If the server answers the handshake with HTTP 401 and an authentication challenge, the Action reports only the four checks that need no credential: `reachability`, `redirect_policy`, `transport_type` and `auth_metadata`, plus what the challenge named (scheme and parameter names, never their values). The other checks are not run.

## Every request the Action sends to your server

It connects to your server only at the host in `url`. With `command` there is no connection: see "Stdio mode". A redirect, or a metadata URL, that points to another host is not requested. Every request to your server carries the user agent `mcpcheckup-release-check/0.1.0`.

1. `POST` `server/discover`.
2. If the server does not answer that as a modern MCP server: `POST` `initialize`, then `POST` `notifications/initialized`.
3. `POST` `tools/list`, again with the returned cursor until the list is complete, up to 10 pages.
4. `POST` `tools/call`, once, with the tool name `__mcpcheckup_probe_nonexistent_tool__`, a name that is made up. It shows how the server reports a tool it did not list. It is not sent when the server lists a tool with that name, when the list could not be read to its end, when the `tools/list` request failed, or when the handshake or the tool list asked for credentials. When it is withheld for one of these reasons and the summary shows the `error_taxonomy` row, the summary says "No tools/call was sent in this run." If the run stopped before reaching it (for example its time or request budget ran out), that row says so and the summary makes neither claim. It is sent only after the tool list the server returned just before shows no tool with that name; the Action never calls a name that list contains.
5. `GET` of the `resource_metadata` URL named in a 401 challenge, only when it is on the same host.

One run is limited to 8 requests (plus the further pages of `tools/list`), 10 seconds in total and 2 MiB per response.

## Requests to GitHub

Only in a pull request run (a `pull_request` or `pull_request_target` event) with `comment` not set to `false`, the Action sends requests to GitHub. They go to the GitHub API address the runner names in `GITHUB_API_URL` (it must be https), with the token in `github-token`. First a `GET` of the pull request's comments, 100 per page and up to 10 pages, stopping when it finds a comment from a bot account that carries this Action's hidden marker (normally the one it posted before) or reaches a page of fewer than 100; then a `PATCH` of that comment or, when there is none, a `POST` of a new one. It sends nothing else to GitHub, and it reads no other token. These requests carry the same user agent, `mcpcheckup-release-check/0.1.0`.

## What it never does

- It sends no credential to a server it connects to: there is no input for one, and no `Authorization`, proxy authorization or cookie header is ever sent. A server it starts with `command` receives the environment variables you name in `env-names` and the fixed set a process needs to start (`PATH`, `HOME`, `USERPROFILE`, `TMPDIR`, `TEMP`, `TMP`, `SystemRoot` and `LANG`), and nothing else from the job's environment.
- It makes no request to any MCP Checkup host.
- It signs nothing, and gives no score and no verdict.
- It does not print your tools' names, descriptions or schemas in the job summary or the comment. Tool names appear only in the JSON file. The only other text of the server's own that is shown is what a check records under fixed rules: the declared protocol revision when it is a date, and the scheme, parameter names and metadata URL of a 401 challenge.

## License

Apache-2.0, in `LICENSE`. The licenses of the code bundled in `dist/index.js` are in `THIRD_PARTY_NOTICES.md`. To report a vulnerability, see `SECURITY.md`.
