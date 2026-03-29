type DiffEngine = 'pierre' | 'codemirror'

interface EngineToggleProps {
  engine: DiffEngine
  onEngineChange: (engine: DiffEngine) => void
}

const engines: DiffEngine[] = ['pierre', 'codemirror']

const labels: Record<DiffEngine, string> = {
  pierre: 'Pierre',
  codemirror: 'CodeMirror',
}

export function EngineToggle({ engine, onEngineChange }: EngineToggleProps) {
  if (!import.meta.env.DEV) return null

  return (
    <div
      id="engine-toggle"
      style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 12px', borderBottom: '1px solid var(--edge)', background: 'var(--sidebar)',
      }}
    >
      <span style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginRight: 4 }}>Engine</span>
      {engines.map((e) => (
        <button
          key={e}
          aria-label={`Use ${labels[e]} engine`}
          onClick={() => onEngineChange(e)}
          style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
            border: engine === e ? '1px solid var(--accent)' : '1px solid var(--edge)',
            background: engine === e ? 'var(--accent)' : 'transparent',
            color: engine === e ? 'var(--base)' : 'var(--fg-secondary)',
            fontWeight: engine === e ? 600 : 400,
          }}
        >{labels[e]}</button>
      ))}
    </div>
  )
}
