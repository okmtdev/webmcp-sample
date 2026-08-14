'use client';

import { useState } from 'react';
import { callRegisteredTool } from '@/lib/webmcp/registry';
import type { WebMCPStatus } from '@/lib/webmcp/registry';
import { useRegisteredTools, useToolLog } from '@/lib/webmcp/useWebMCP';

/**
 * 右レールの MiiTel MCP パネル。
 *
 * - 接続状態
 * - ツール呼び出しのライブログ（エージェントが呼ぶとここに流れる）
 * - ブリッジ拡張機能がなくても動作を確認できる手動実行フォーム
 */
export default function McpPanel({ status }: { status: WebMCPStatus }) {
  const tools = useRegisteredTools();
  const toolLog = useToolLog();
  const [selected, setSelected] = useState('miitel_get_admin_guide');
  const [argsText, setArgsText] = useState('{}');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);

  const current = tools.find((t) => t.name === selected);

  async function run() {
    setRunning(true);
    setOutput('');
    try {
      let parsed: Record<string, unknown> = {};
      const trimmed = argsText.trim();
      if (trimmed) {
        const value: unknown = JSON.parse(trimmed);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new Error('引数は JSON オブジェクトで指定してください。');
        }
        parsed = value as Record<string, unknown>;
      }
      const result = await callRegisteredTool(selected, parsed);
      setOutput(result.content.map((c) => c.text).join('\n'));
    } catch (err) {
      setOutput(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">MiiTel MCP</span>
          <span className={status.backend === 'external' ? 's-badge ok' : 's-badge warn'}>
            {status.backend === 'external' ? '接続可' : '内蔵のみ'}
          </span>
        </div>
        <div className="s-card-body tight s-stack">
          <div className={status.backend === 'external' ? 's-note ok' : 's-note warn'}>
            <b>{status.label}</b>
            <div style={{ marginTop: 4 }}>{status.detail}</div>
          </div>
          <div className="s-muted">
            設置先: <code className="s-mono">document.modelContext</code>
            <br />
            公開ツール数: <b>{tools.length}</b>
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">ツールを手動で試す</span>
        </div>
        <div className="s-card-body tight s-stack">
          <div className="s-muted">
            エージェントを繋がなくても、ここから同じツールを呼べます。挙動の下見に使ってください。
          </div>
          <select
            className="s-select"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setOutput('');
            }}
            aria-label="実行するツール"
          >
            {tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          {current && <div className="s-muted">{current.description}</div>}
          <textarea
            className="s-textarea"
            rows={4}
            spellCheck={false}
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            aria-label="ツール引数（JSON）"
          />
          <div className="s-row">
            <button className="s-btn primary sm" onClick={run} disabled={running || !current}>
              {running ? '実行中…' : '実行'}
            </button>
            <button className="s-btn sm" onClick={() => setArgsText('{}')}>
              引数クリア
            </button>
          </div>
          {output && <pre className="s-console">{output}</pre>}
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">ツール呼び出しログ</span>
          <span className="s-badge">{toolLog.length}</span>
        </div>
        <div className="s-card-body tight">
          <pre className="s-console">
            {toolLog.length === 0 && (
              <span className="dim">
                まだ呼び出しはありません。{'\n'}
                エージェントがこのページのツールを呼ぶと、ここに 1 行ずつ流れます。
              </span>
            )}
            {toolLog.map((entry) => (
              <div key={entry.seq}>
                <span className="dim">[{entry.at.slice(11, 19)}]</span>{' '}
                <span className={entry.ok ? 'call' : 'err'}>{entry.tool}</span>{' '}
                <span className="dim">{JSON.stringify(entry.args)}</span>
                {'\n'}
                {entry.summary.split('\n').slice(0, 3).join('\n')}
                {'\n'}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </>
  );
}
