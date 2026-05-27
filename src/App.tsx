import { useState, useRef, useEffect, useCallback } from 'react';

type Message = { role: 'user' | 'assistant'; text: string };
type Member = { id: string; name: string };
type Expense = {
  id: string;
  desc: string;
  amount: number;
  category: string;
  paidBy: string;
  date: number;
  currency: string;
};
type TripData = {
  code: string;
  members: Member[];
  expenses: Expense[];
  currency: string;
};

const CATEGORIES: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  food: { label: 'Food & Drinks', icon: '🍜', color: '#D85A30' },
  transport: { label: 'Transport', icon: '🚕', color: '#378ADD' },
  shopping: { label: 'Shopping', icon: '🛍️', color: '#7F77DD' },
  accommodation: { label: 'Stay', icon: '🏨', color: '#1D9E75' },
  activities: { label: 'Activities', icon: '🎟️', color: '#BA7517' },
  other: { label: 'Other', icon: '📌', color: '#888780' },
};

const CURRENCIES = [
  'USD',
  'SGD',
  'EUR',
  'GBP',
  'JPY',
  'TWD',
  'THB',
  'HKD',
  'AUD',
];

function parseExpense(text: string, members: Member[]) {
  const amtMatch = text.match(/(\d+(?:\.\d{1,2})?)/);
  const amount = amtMatch ? parseFloat(amtMatch[1]) : null;
  const lower = text.toLowerCase();
  let category = 'other';
  if (
    /food|eat|lunch|dinner|breakfast|drink|coffee|restaurant|pizza|burger/.test(
      lower
    )
  )
    category = 'food';
  else if (/taxi|uber|grab|bus|mrt|train|flight|transport|metro/.test(lower))
    category = 'transport';
  else if (/shop|buy|mall|souvenir|market/.test(lower)) category = 'shopping';
  else if (/hotel|hostel|airbnb|stay|room/.test(lower))
    category = 'accommodation';
  else if (/ticket|tour|museum|park|entry/.test(lower)) category = 'activities';
  let paidBy = members[0]?.name || 'Unknown';
  for (const m of members) {
    if (lower.includes(m.name.toLowerCase())) {
      paidBy = m.name;
      break;
    }
  }
  const desc =
    text
      .replace(/\d+(?:\.\d{1,2})?/, '')
      .replace(/paid by \w+/i, '')
      .trim() || text;
  return { amount, category, paidBy, desc };
}

function genCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

const POLL_MS = 5000;

export default function App() {
  const [screen, setScreen] = useState<'join' | 'app'>('join');
  const [myName, setMyName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [tripCode, setTripCode] = useState('');
  const [myId, setMyId] = useState('');
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [tab, setTab] = useState('log');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newMember, setNewMember] = useState('');
  const [syncing, setSyncing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Storage helpers ---
  const storageKey = (code: string) => `tripsplit-${code}`;

  const loadTrip = useCallback(
    async (code: string): Promise<TripData | null> => {
      try {
        const res = await (window as any).storage.get(storageKey(code), true);
        return res ? JSON.parse(res.value) : null;
      } catch {
        return null;
      }
    },
    []
  );

  const saveTrip = useCallback(async (code: string, data: TripData) => {
    try {
      await (window as any).storage.set(
        storageKey(code),
        JSON.stringify(data),
        true
      );
    } catch {
      console.error('Save failed');
    }
  }, []);

  // --- Polling for live sync ---
  const startPolling = useCallback(
    (code: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        setSyncing(true);
        const data = await loadTrip(code);
        if (data) setTripData(data);
        setSyncing(false);
      }, POLL_MS);
    },
    [loadTrip]
  );

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  // --- Create a new trip ---
  const createTrip = async () => {
    if (!myName.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    const code = genCode();
    const id = 'u' + Date.now();
    const trip: TripData = {
      code,
      currency: 'USD',
      members: [{ id, name: myName.trim() }],
      expenses: [],
    };
    await saveTrip(code, trip);
    setTripCode(code);
    setMyId(id);
    setTripData(trip);
    setMessages([
      {
        role: 'assistant',
        text: `Trip created! 🎉\nYour code is: ${code}\n\nShare this with your group so they can join.\n\nLog expenses like:\n"Dinner 45 paid by ${myName.trim()}"\n"Grab taxi 12"`,
      },
    ]);
    startPolling(code);
    setScreen('app');
    setLoading(false);
  };

  // --- Join an existing trip ---
  const joinTrip = async () => {
    if (!myName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!codeInput.trim()) {
      setError('Please enter a trip code');
      return;
    }
    setLoading(true);
    const code = codeInput.trim().toUpperCase();
    let trip = await loadTrip(code);
    if (!trip) {
      setError('Trip not found. Check the code and try again.');
      setLoading(false);
      return;
    }
    const existing = trip.members.find(
      (m) => m.name.toLowerCase() === myName.trim().toLowerCase()
    );
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      id = 'u' + Date.now();
      trip.members.push({ id, name: myName.trim() });
      await saveTrip(code, trip);
    }
    setTripCode(code);
    setMyId(id);
    setTripData(trip);
    setMessages([
      {
        role: 'assistant',
        text: `Welcome to the trip! 👋\n${
          trip.members.length
        } traveller(s) so far.\n\nLog expenses like:\n"Lunch 18 paid by ${myName.trim()}"`,
      },
    ]);
    startPolling(code);
    setScreen('app');
    setLoading(false);
  };

  // --- Log an expense ---
  const handleSend = async () => {
    const text = input.trim();
    if (!text || !tripData) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    const { amount, category, paidBy, desc } = parseExpense(
      text,
      tripData.members
    );
    if (amount) {
      const fresh = (await loadTrip(tripCode)) || tripData;
      const exp: Expense = {
        id: 'e' + Date.now(),
        desc,
        amount,
        category,
        paidBy,
        date: Date.now(),
        currency: fresh.currency,
      };
      const updated = { ...fresh, expenses: [exp, ...fresh.expenses] };
      await saveTrip(tripCode, updated);
      setTripData(updated);
      setTimeout(
        () =>
          setMessages((m) => [
            ...m,
            {
              role: 'assistant',
              text: `Logged! ${fresh.currency} ${amount.toFixed(
                2
              )} for "${desc}" (${
                CATEGORIES[category].label
              }), paid by ${paidBy} ✓`,
            },
          ]),
        300
      );
    } else {
      setTimeout(
        () =>
          setMessages((m) => [
            ...m,
            {
              role: 'assistant',
              text: 'Couldn\'t find an amount. Try: "Lunch 18 paid by Por"',
            },
          ]),
        300
      );
    }
  };

  // --- Add a member ---
  const addMember = async () => {
    if (!newMember.trim() || !tripData) return;
    const fresh = (await loadTrip(tripCode)) || tripData;
    if (
      fresh.members.find(
        (m) => m.name.toLowerCase() === newMember.trim().toLowerCase()
      )
    ) {
      setNewMember('');
      return;
    }
    const updated = {
      ...fresh,
      members: [
        ...fresh.members,
        { id: 'u' + Date.now(), name: newMember.trim() },
      ],
    };
    await saveTrip(tripCode, updated);
    setTripData(updated);
    setNewMember('');
  };

  // --- Remove a member ---
  const removeMember = async (id: string) => {
    if (!tripData || tripData.members.length <= 1) return;
    const fresh = (await loadTrip(tripCode)) || tripData;
    const updated = {
      ...fresh,
      members: fresh.members.filter((m) => m.id !== id),
    };
    await saveTrip(tripCode, updated);
    setTripData(updated);
  };

  // --- Change currency ---
  const changeCurrency = async (cur: string) => {
    const fresh = (await loadTrip(tripCode)) || tripData!;
    const updated = { ...fresh, currency: cur };
    await saveTrip(tripCode, updated);
    setTripData(updated);
  };

  // --- Delete expense ---
  const deleteExpense = async (eid: string) => {
    const fresh = (await loadTrip(tripCode)) || tripData!;
    const updated = {
      ...fresh,
      expenses: fresh.expenses.filter((e) => e.id !== eid),
    };
    await saveTrip(tripCode, updated);
    setTripData(updated);
  };

  // --- Computed values ---
  const totalSpend = tripData?.expenses.reduce((s, e) => s + e.amount, 0) || 0;
  const members = tripData?.members || [];

  const balances: Record<string, number> = Object.fromEntries(
    members.map((m) => [m.name, 0])
  );
  tripData?.expenses.forEach((e) => {
    const per = e.amount / members.length;
    members.forEach((m) => {
      balances[m.name] -= per;
    });
    balances[e.paidBy] = (balances[e.paidBy] || 0) + e.amount;
  });

  const byCategory: Record<string, number> = {};
  tripData?.expenses.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });

  const cur = tripData?.currency || 'USD';

  // ===================== RENDER =====================

  // --- Join screen ---
  if (screen === 'join')
    return (
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          minHeight: '100vh',
          background: '#f5f5f3',
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✈️</div>
          <h1 style={{ fontSize: 28, fontWeight: 500, marginBottom: 6 }}>
            TripSplit
          </h1>
          <p style={{ fontSize: 14, color: '#888' }}>
            Shared expense tracker for groups
          </p>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 20 }}>
          <label
            style={{
              fontSize: 13,
              fontWeight: 500,
              display: 'block',
              marginBottom: 6,
            }}
          >
            Your name
          </label>
          <input
            value={myName}
            onChange={(e) => {
              setMyName(e.target.value);
              setError('');
            }}
            placeholder="e.g. Por"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.2)',
              fontSize: 14,
              marginBottom: 12,
              boxSizing: 'border-box' as const,
              outline: 'none',
            }}
          />
          {error && (
            <p style={{ color: '#D85A30', fontSize: 12, marginBottom: 8 }}>
              {error}
            </p>
          )}
          <button
            onClick={createTrip}
            disabled={loading}
            style={{
              width: '100%',
              padding: 11,
              borderRadius: 8,
              background: '#1a1a18',
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              marginBottom: 12,
            }}
          >
            {loading ? 'Creating…' : 'Create new trip'}
          </button>
          <div
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: '#aaa',
              marginBottom: 12,
            }}
          >
            — or join an existing trip —
          </div>
          <input
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value.toUpperCase());
              setError('');
            }}
            placeholder="Trip code e.g. X7K2P"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.2)',
              fontSize: 14,
              marginBottom: 12,
              boxSizing: 'border-box' as const,
              outline: 'none',
            }}
          />
          <button
            onClick={joinTrip}
            disabled={loading}
            style={{
              width: '100%',
              padding: 11,
              borderRadius: 8,
              background: 'none',
              border: '1px solid rgba(0,0,0,0.2)',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Joining…' : 'Join trip'}
          </button>
        </div>
      </div>
    );

  if (!tripData)
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div>;

  // --- Main app ---
  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100vh',
        background: '#f5f5f3',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#fff',
          padding: '16px 16px 0',
          borderBottom: '1px solid rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>✈ TripSplit</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {syncing && (
              <span style={{ fontSize: 11, color: '#aaa' }}>syncing…</span>
            )}
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                padding: '2px 8px',
                borderRadius: 20,
                background: '#f0f0ee',
                color: '#666',
              }}
            >
              {tripCode}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          {['log', 'review', 'settings'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                borderBottom:
                  tab === t ? '2px solid #1a1a18' : '2px solid transparent',
                fontWeight: tab === t ? 600 : 400,
                fontSize: 13,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* LOG TAB */}
        {tab === 'log' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 130px)',
            }}
          >
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent:
                      m.role === 'user' ? 'flex-end' : 'flex-start',
                    margin: '6px 0',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '9px 13px',
                      borderRadius:
                        m.role === 'user'
                          ? '16px 16px 4px 16px'
                          : '16px 16px 16px 4px',
                      background: m.role === 'user' ? '#1a1a18' : '#fff',
                      color: m.role === 'user' ? '#fff' : '#1a1a18',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      border:
                        m.role === 'assistant'
                          ? '1px solid rgba(0,0,0,0.1)'
                          : 'none',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                paddingTop: 8,
                borderTop: '1px solid rgba(0,0,0,0.1)',
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={`e.g. Dinner 45 paid by ${
                  members[0]?.name || 'Por'
                }...`}
                style={{
                  flex: 1,
                  padding: '9px 14px',
                  borderRadius: 20,
                  border: '1px solid rgba(0,0,0,0.2)',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSend}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#1a1a18',
                  border: 'none',
                  color: '#fff',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ↑
              </button>
            </div>
          </div>
        )}

        {/* REVIEW TAB */}
        {tab === 'review' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  total spent
                </div>
                <div style={{ fontSize: 22, fontWeight: 500 }}>
                  {cur} {totalSpend.toFixed(0)}
                </div>
              </div>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  expenses
                </div>
                <div style={{ fontSize: 22, fontWeight: 500 }}>
                  {tripData.expenses.length}
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 12,
                }}
              >
                by category
              </div>
              {Object.entries(byCategory).map(([cat, amt]) => {
                const c = CATEGORIES[cat];
                return (
                  <div
                    key={cat}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <span style={{ fontSize: 16, width: 22 }}>{c.icon}</span>
                    <span style={{ fontSize: 12.5, width: 90, flexShrink: 0 }}>
                      {c.label}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 3,
                        background: '#eee',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${
                            totalSpend ? (amt / totalSpend) * 100 : 0
                          }%`,
                          background: c.color,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        minWidth: 52,
                        textAlign: 'right',
                      }}
                    >
                      {cur} {amt.toFixed(0)}
                    </span>
                  </div>
                );
              })}
              {Object.keys(byCategory).length === 0 && (
                <p
                  style={{
                    fontSize: 13,
                    color: '#aaa',
                    textAlign: 'center',
                    padding: '8px 0',
                  }}
                >
                  No expenses yet
                </p>
              )}
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 12,
                }}
              >
                balances
              </div>
              {members.map((m) => {
                const b = balances[m.name] || 0;
                const color = b >= 0 ? '#1D9E75' : '#D85A30';
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: color + '22',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 600,
                        color,
                      }}
                    >
                      {m.name[0]}
                    </div>
                    <span style={{ flex: 1, fontSize: 14 }}>
                      {m.name} {m.id === myId ? '(you)' : ''}
                    </span>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 20,
                        background: color + '18',
                        fontSize: 12,
                        fontWeight: 500,
                        color,
                      }}
                    >
                      {b >= 0 ? 'gets back' : 'owes'} {cur}{' '}
                      {Math.abs(b).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 12,
                }}
              >
                history
              </div>
              {tripData.expenses.length === 0 && (
                <p
                  style={{
                    fontSize: 13,
                    color: '#aaa',
                    textAlign: 'center',
                    padding: '8px 0',
                  }}
                >
                  No expenses yet
                </p>
              )}
              {tripData.expenses.map((e) => {
                const c = CATEGORIES[e.category];
                return (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      paddingBottom: 10,
                      marginBottom: 10,
                      borderBottom: '1px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: c.color + '18',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                      }}
                    >
                      {c.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                        {e.desc}
                      </div>
                      <div
                        style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}
                      >
                        {e.paidBy} paid · split {members.length} ways
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {cur} {e.amount.toFixed(2)}
                      </div>
                      <button
                        onClick={() => deleteExpense(e.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ccc',
                          fontSize: 13,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <div>
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 10,
                }}
              >
                trip code
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 26,
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  marginBottom: 6,
                }}
              >
                {tripCode}
              </div>
              <p style={{ fontSize: 12, color: '#888' }}>
                Share this code with your travel group. Syncs every{' '}
                {POLL_MS / 1000}s.
              </p>
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 10,
                }}
              >
                currency
              </div>
              <select
                value={cur}
                onChange={(e) => changeCurrency(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(0,0,0,0.2)',
                  fontSize: 14,
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 12,
                }}
              >
                travellers
              </div>
              {members.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#f0f0ee',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {m.name[0]}
                  </div>
                  <span style={{ flex: 1, fontSize: 14 }}>
                    {m.name} {m.id === myId ? '(you)' : ''}
                  </span>
                  {m.id !== myId && members.length > 1 && (
                    <button
                      onClick={() => removeMember(m.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ccc',
                        fontSize: 18,
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  value={newMember}
                  onChange={(e) => setNewMember(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMember()}
                  placeholder="Add traveller name"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.2)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={addMember}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: '#1a1a18',
                    border: 'none',
                    color: '#fff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                if (pollRef.current) clearInterval(pollRef.current);
                setScreen('join');
                setTripData(null);
                setTripCode('');
                setMessages([]);
              }}
              style={{
                width: '100%',
                padding: 11,
                borderRadius: 8,
                background: 'none',
                border: '1px solid #D85A30',
                color: '#D85A30',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Leave trip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
