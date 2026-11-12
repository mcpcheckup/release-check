# MCP Checkup Release Check

一个 GitHub Action：在发布前，从你自己的 runner 观察你的 MCP server，并把看到的内容写进 job summary、PR 评论和一个 JSON 文件。

它报告的一切都是在你的 runner 里观察到的，没有签名。它不是 MCP Checkup 的 attestation，不给分数，也不下判定。它不需要 MCP Checkup 账户，也不向 MCP Checkup 发送任何东西。[English](README.md)

## 使用

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

同一份 workflow 在 `examples/release-check.yml`。仓库发布了 release tag 或完整 commit SHA 之后，请把 Action 固定到其中一个。JSON 文件由 Action 写出；上面的 `upload-artifact` 一步负责把它留作 artifact。

## 输入

| 输入 | 必填 | 默认值 | 含义 |
| --- | --- | --- | --- |
| `url` | `url` 或 `command` | | 一个已在运行的 server 的 MCP endpoint：http 或 https，不含用户名和密码。其中的 query 会原样发出，但不会被打印或保存。 |
| `command` | `url` 或 `command` | | 让 Action 在 runner 里启动的 server，写成不经 shell 的 JSON 数组：先是程序，再是它的参数，例如 `["node", "server.js"]`。见“stdio 模式”。`url` 和 `command` 给一个，不能两个都给。 |
| `env-names` | 否 | | 只与 `command` 一起用：job 里哪些环境变量会传给被启动的 server，名字用逗号或换行分隔。本 Action 从不打印或保存这些值。如果 server 自己把某个值写进回答（例如写进工具名），它会作为回答的一部分被记录。 |
| `comment` | 否 | `true` | 在 PR 上发一条评论，重跑时更新这一条。`false` 时只写 job summary 和 JSON 文件。 |
| `github-token` | 否 | `${{ github.token }}` | runner 自己的 token。它只用于下文“向 GitHub 发出的请求”里的那些请求，从不发给被观察的 server。 |
| `output-file` | 否 | `release-check-observation.json` | JSON 文件的写入位置，必须是 workspace 内的路径。 |

输出：`observation-file`、`scope`、`protocol-revision`、`tool-count`、`toolset-fingerprint` 和 `schema-fingerprint`。

## stdio 模式

给了 `command` 时，Action 在 runner 里启动你的 server，并经由它的标准输入输出运行同样的检查。不会对它发出任何网络请求。

```yaml
      - id: check
        uses: mcpcheckup/release-check@main
        with:
          command: '["node", "dist/server.js"]'
          env-names: |
            MY_SERVER_CONFIG
```

- `command` 是字符串的 JSON 数组，先是程序，再是它的参数。它不经 shell 启动，工作目录是 workspace。
- server 会收到 `env-names` 里点名的变量，以及 `PATH`、`HOME`、`USERPROFILE`、`TMPDIR`、`TEMP`、`TMP`、`SystemRoot` 和 `LANG`。job 环境里的其他变量它都收不到，GitHub token 也不例外。`env-names` 里的某个名字在 job 里没有设置，会报错。
- JSON 文件里有 `launch_config_digest`：一个 `sha256:` 摘要，由 `command` 每个元素的哈希，以及 `env-names` 里每个名字和它的值的哈希组成。本 Action 不会在任何地方打印或保存任何值和任何参数，上面那八个变量也不在摘要里。对很短或容易猜到的值，可以逐个尝试把哈希还原出来。所以如果点名的某个变量是很短的密钥，请不要在公开仓库里把 JSON 文件作为 artifact 上传。
- server 写出的内容从不显示。它的标准输出只用来找出对 Action 请求的回答，其余内容读都不读就丢弃；它的标准错误被直接丢弃。回答本身留下什么，与任何 server 相同：JSON 文件里有工具名称，其余见“它从不做的事”。
- 发出的请求就是“Action 发给你的 server 的每一个请求”里列的那些，每条 JSON 消息占一行；通知没有回答。
- 限制：从启动到第一个回答 30 秒，之后握手的每条消息 15 秒，之后的每个请求 10 秒，总共 90 秒，单行 2 MiB。达到某个限制、server 提前退出或无法启动时，summary 的“Server process”一行会写明，JSON 文件在 `process` 里记录，Action 会杀掉 server 的进程树。已不在这棵树里的进程（例如自己脱离了的进程），Action 不会停止它，也不会等待它或它仍持有的任何管道。在 Windows runner 上，如果 Action 启动的进程先退出，它启动的子进程可能留在后台继续运行，Action 找不到也不会停止它们。
- summary 里写英文原句 "The checks that observe an HTTP endpoint (reachability, redirects, transport type, authorization metadata, TLS and latency) are not reported for a server on stdio."（意思是：观察 HTTP 端点的检查（可达性、重定向、传输类型、授权元数据、TLS 和延迟）不会为 stdio 的 server 报告。）它们是 `reachability`、`redirect_policy`、`transport_type`、`auth_metadata`、`tls_certificate` 和 `latency_profile`。

## 你会得到什么

- **Job summary。** 表头是「Observed in this runner · unsigned」：server 声明的协议版本、工具数、toolset 与 schema 指纹，以及每项检查一行。
- **PR 评论。** 内容相同。评论里带一个隐藏标记，重跑时会更新带有这个标记的那条评论，不会再发新的。来自 fork 的 PR 上，runner 的 token 是只读的：这时评论会被跳过并给出警告，job summary 里仍有结果。
- **JSON 文件。** 协议版本、各工具的名称和各自的指纹、toolset 与 schema 指纹，以及每项检查的状态和原因。它用来和之后的观察结果比对。

## 检查，以及 job 如何对待它们

检查就是 MCP Checkup 的检查套件，在你的 runner 里运行。每项检查给出四种状态之一，并附原因：VERIFIED、FAILED、OBSERVED_RISK 或 UNVERIFIED。它们不会被合成分数或判定。延迟和错误形态都是从你的 runner 测得的，不是来自 MCP Checkup 自己的探测。当工具列表被完整读取时，有两项检查把工具列表与已批准的基线比较，即 `toolset_unchanged_vs_approved` 和 `schema_unchanged_vs_approved`；这个 Action 不读取基线，所以这两项报告为 UNVERIFIED，原因栏里写英文原句 "Not compared: this Action does not read a baseline."（意思是：未比较：这个 Action 不读取基线。）否则这两行写的是工具列表或其指纹不可用的原因。

策略是 neutral：job 不会因为 server 的回答而失败。只有 Action 自身无法运行时才会失败，例如缺少 `url` 或它不是合法的 URL。

如果 server 在握手时返回 HTTP 401 和认证 challenge，Action 只报告那四项不需要凭据的检查：`reachability`、`redirect_policy`、`transport_type` 和 `auth_metadata`，再加上 challenge 点名的内容（scheme 和参数名，不含参数值）。其余检查不运行。

## Action 发给你的 server 的每一个请求

它只在 `url` 里的主机上连接你的 server。给了 `command` 时没有连接：见“stdio 模式”。指向其他主机的重定向或 metadata URL 不会被请求。发给你的 server 的每个请求都带 user agent `mcpcheckup-release-check/0.1.0`。

1. `POST` `server/discover`。
2. 如果 server 不是以现代 MCP server 的方式回答：`POST` `initialize`，再 `POST` `notifications/initialized`。
3. `POST` `tools/list`，带着返回的 cursor 继续，直到列表读完，最多 10 页。
4. `POST` `tools/call` 一次，工具名是 `__mcpcheckup_probe_nonexistent_tool__`，这是一个编造的名字，用来看 server 如何报告一个它没有列出的工具。如果 server 列出了同名工具、列表没有读到末尾、`tools/list` 请求失败，或者握手或工具列表要求凭据，就不会发送。因这些原因之一而不发送、且 summary 里有 `error_taxonomy` 这一行时，summary 里写英文原句 "No tools/call was sent in this run."（意思是：这次运行没有发送 tools/call。）如果运行在到达它之前就停止了（例如时间或请求预算用完），该行会写明原因，summary 对此不作任何声明。只有在 server 刚返回的工具列表里没有这个名字时才会发送；列表里有的工具名，这个 Action 从不调用。
5. `GET` 401 challenge 里点名的 `resource_metadata` URL，仅当它与 server 在同一主机上。

一次运行的上限是 8 个请求（另加 `tools/list` 的后续页）、总共 10 秒、每个响应 2 MiB。

## 向 GitHub 发出的请求

只有在 PR 运行中（`pull_request` 或 `pull_request_target` 事件）且 `comment` 没有设为 `false` 时，Action 才会向 GitHub 发请求。请求发往 runner 在 `GITHUB_API_URL` 里给出的 GitHub API 地址（必须是 https），带的是 `github-token` 里的 token。先 `GET` 这个 PR 的评论，每页 100 条、最多 10 页，读到一条由 bot 账户发出、带有这个 Action 隐藏标记的评论（通常就是它之前发的那条），或读到不足 100 条的一页就停；然后对那条评论 `PATCH`，没有那条评论时 `POST` 一条新的。它不向 GitHub 发其他任何请求，也不读取别的 token。这些请求带同样的 user agent `mcpcheckup-release-check/0.1.0`。

## 它从不做的事

- 它不向它所连接的 server 发送任何凭据：没有可填凭据的输入，也从不发送 `Authorization`、代理授权或 cookie 头。用 `command` 启动的 server，会收到你在 `env-names` 里点名的环境变量，以及进程启动所需的那组固定变量（`PATH`、`HOME`、`USERPROFILE`、`TMPDIR`、`TEMP`、`TMP`、`SystemRoot` 和 `LANG`），job 环境里的其他变量它都收不到。
- 它不向任何 MCP Checkup 主机发请求。
- 它不签名，不给分数，也不下判定。
- 它不会在 job summary 或评论里打印你的工具名称、描述或 schema。工具名称只出现在 JSON 文件里。server 自己的文本，只有检查按固定规则记录下来的部分才会显示：server 声明的协议版本（仅当它是一个日期），以及 401 challenge 的 scheme、参数名和 metadata URL。

## 许可证

Apache-2.0，见 `LICENSE`。打包进 `dist/index.js` 的代码的许可证在 `THIRD_PARTY_NOTICES.md`。报告漏洞请见 `SECURITY.md`。
