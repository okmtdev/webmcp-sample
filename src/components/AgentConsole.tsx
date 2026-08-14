'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/hooks';
import { callRegisteredTool } from '@/lib/webmcp/registry';
import type { WebMCPStatus } from '@/lib/webmcp/registry';
import { useRegisteredTools } from '@/lib/webmcp/useWebMCP';

/**
 * 右サイドの WebMCP パネル。
 *
 * - このページが公開しているツールの一覧
 * - ツール呼び出しのライブログ（エージェントが呼ぶとここに流れる）
 * - 拡張機能なしでも動作を確認できる手動実行フォーム
 */
export default function AgentConsole({ status }: { status: WebMCPStatus }) {
  const state = useAppState();
  const tools = useRegisteredTools();
  const [selected, setSelected] = useState('get_system_manual');
  const [argsText, setArgsText] = useState('{}');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [showTools, setShowTools] = useState(true);

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
      <div className="bevel-out" style={{ padding: 3 }}>
        <div className="titlebar" style={{ marginBottom: 3 }}>
          <span>WebMCP 連携状態</span>
        </div>
        <div className={status.backend === 'external' ? 'okbox' : 'warnbox'}>
          <b>{status.label}</b>
          <div className="note" style={{ marginTop: 2 }}>
            {status.detail}
          </div>
        </div>
        <div className="note" style={{ marginTop: 3 }}>
          設置先: <code className="mono">document.modelContext</code>
          <br />
          公開ツール数: <b>{tools.length}</b>
        </div>
      </div>

      <div className="bevel-out" style={{ padding: 3 }}>
        <div className="row-flex" style={{ justifyContent: 'space-between' }}>
          <b style={{ fontSize: 11 }}>公開ツール一覧</b>
          <button className="btn small" onClick={() => setShowTools((v) => !v)}>
            {showTools ? '閉じる' : '開く'}
          </button>
        </div>
        {showTools && (
          <div className="tool-list" style={{ marginTop: 3 }}>
            {tools.length === 0 && <div className="row note">登録中…</div>}
            {tools.map((t) => (
              <div className="row" key={t.name}>
                <code>{t.name}</code>
                {t.annotations?.readOnlyHint && <span className="badge-ok" style={{ marginLeft: 4 }}>読取</span>}
                {t.annotations?.destructiveHint && <span className="badge-err" style={{ marginLeft: 4 }}>破壊</span>}
                <div className="note">{t.annotations?.title ?? ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bevel-out" style={{ padding: 3 }}>
        <div className="titlebar" style={{ marginBottom: 3 }}>
          <span>ツールを手動で試す</span>
        </div>
        <div className="note" style={{ marginBottom: 3 }}>
          エージェントを繋がなくても、ここから同じツールを呼べます。挙動の下見に使ってください。
        </div>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ width: '100%' }}>
          {tools.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        {current && (
          <div className="note" style={{ margin: '3px 0' }}>
            {current.description}
          </div>
        )}
        <textarea
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          rows={4}
          spellCheck={false}
          style={{ width: '100%', fontFamily: 'MS Gothic, monospace', fontSize: 11 }}
          aria-label="ツール引数（JSON）"
        />
        <div className="row-flex" style={{ marginTop: 3 }}>
          <button className="btn small primary" onClick={run} disabled={running || !current}>
            {running ? '実行中…' : '実行'}
          </button>
          <button className="btn small" onClick={() => setArgsText('{}')}>
            引数クリア
          </button>
        </div>
        {output && (
          <div className="console" style={{ marginTop: 3, height: 150 }}>
            {output}
          </div>
        )}
      </div>

      <div className="bevel-out" style={{ padding: 3 }}>
        <div className="titlebar" style={{ marginBottom: 3 }}>
          <span>ツール呼び出しログ</span>
        </div>
        <div className="console">
          {state.log.length === 0 && (
            <span className="dim">
              まだ呼び出しはありません。{'\n'}
              エージェントがこのページのツールを呼ぶと、ここに 1 行ずつ流れます。
            </span>
          )}
          {state.log.map((entry) => (
            <div key={entry.seq}>
              <span className="dim">[{entry.at.slice(11, 19)}]</span>{' '}
              <span className={entry.ok ? 'call' : 'err'}>{entry.tool}</span>{' '}
              <span className="dim">{JSON.stringify(entry.args)}</span>
              {'\n'}
              <span className={entry.ok ? undefined : 'err'}>
                {entry.summary.split('\n').slice(0, 3).join('\n')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
