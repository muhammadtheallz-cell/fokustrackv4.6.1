import { useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { TransactionCategory, TransactionType } from '../../types'
import { formatMonthYear, formatShortDate, getLastNDaysKeys } from '../../utils/date'
import { formatRupiah } from '../../utils/currency'
import { aggregateTransactionsForDays } from '../../utils/appMetrics.js'
import Icon from '../../components/ui/Icon'
import Modal from '../../components/ui/Modal'

const EXPENSE_CATEGORIES: TransactionCategory[] = [
  'Makan & Minum',
  'Transportasi',
  'Tagihan',
  'Belanja',
  'Hiburan',
  'Lainnya',
]

const INCOME_CATEGORIES: TransactionCategory[] = ['Gaji & Bonus', 'Tabungan', 'Lainnya']

export default function FinancePage() {
  const {
    todayKey,
    transactions,
    addTransaction,
    deleteTransaction,
    totalBalance,
    monthIncome,
    monthExpense,
    settings,
    updateSettings,
    exportBackupJson,
    importBackupJson,
    resetStreakOnly,
    resetAllData,
    loadSampleData,
  } = useApp()

  const [txModalOpen, setTxModalOpen] = useState(false)
  const [backupModalOpen, setBackupModalOpen] = useState(false)
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all')
  const [visibleTransactionLimit, setVisibleTransactionLimit] = useState(50)

  const [txType, setTxType] = useState<TransactionType>('expense')
  const [txTitle, setTxTitle] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txCategory, setTxCategory] = useState<TransactionCategory>('Makan & Minum')
  const [txDate, setTxDate] = useState(todayKey)

  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const last7Days = useMemo(() => getLastNDaysKeys(7), [todayKey])

  const chartData = useMemo(
    () => aggregateTransactionsForDays(transactions, last7Days),
    [last7Days, transactions],
  )

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((t) => (filterType === 'all' ? true : t.type === filterType))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [transactions, filterType])
  const visibleTransactions = filteredTransactions.slice(0, visibleTransactionLimit)

  function openNewTx(type: TransactionType) {
    setTxType(type)
    setTxCategory(type === 'expense' ? 'Makan & Minum' : 'Gaji & Bonus')
    setTxTitle('')
    setTxAmount('')
    setTxDate(todayKey)
    setTxModalOpen(true)
  }

  function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault()
    const amountNum = Number(txAmount)
    if (!txTitle.trim() || txTitle.trim().length > 120 || !Number.isSafeInteger(amountNum) || amountNum <= 0 || !txDate) return

    addTransaction({
      title: txTitle.trim(),
      amount: amountNum,
      type: txType,
      category: txCategory,
      date: txDate || todayKey,
    })
    setTxModalOpen(false)
  }

  function handleDownloadBackup() {
    const json = exportBackupJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fokustrack-backup-${todayKey}.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setBackupStatus('File backup JSON berhasil diunduh.')
  }

  function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const confirmed = window.confirm('Pemulihan backup akan mengganti data FokusTrack yang sedang tersimpan di perangkat ini. Unduh backup data saat ini terlebih dahulu bila masih diperlukan. Lanjutkan?')
    if (!confirmed) {
      e.target.value = ''
      return
    }
    if (file.size > 10_000_000) {
      setBackupStatus('File terlalu besar. Maksimal ukuran backup adalah 10 MB.')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const ok = importBackupJson(String(reader.result || ''))
      setBackupStatus(ok ? 'Data berhasil dipulihkan!' : 'Format file JSON tidak valid atau tidak sesuai skema.')
      e.target.value = ''
    }
    reader.onerror = () => {
      setBackupStatus('File tidak dapat dibaca. Coba pilih file backup lain.')
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  const savingsRate =
    monthIncome > 0 ? Math.round(((monthIncome - monthExpense) / monthIncome) * 100) : 0

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">PERSONAL FINANCE</p>
          <h1>
            Dompet <span className="gradient-text">&amp; tabungan.</span>
          </h1>
          <p className="heading-subtitle">Kendali penuh atas arus kas harianmu.</p>
        </div>
        <div className="inline-actions">
          <button
            className="icon-button"
            onClick={() => updateSettings({ hideBalance: !settings.hideBalance })}
            aria-label={settings.hideBalance ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
            title="Mode privasi saldo"
          >
            <Icon name={settings.hideBalance ? 'eye-off' : 'eye'} size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => {
              setBackupStatus(null)
              setBackupModalOpen(true)
            }}
            aria-label="Backup, restore, dan reset data"
            title="Pengaturan Data & Reset"
          >
            <Icon name="sliders" size={18} />
          </button>
        </div>
      </section>

      <section className="finance-hero">
        <div className="finance-hero-top">
          <span className="card-kicker">TOTAL SALDO &amp; TABUNGAN</span>
          <span className="finance-period">{formatMonthYear()}</span>
        </div>
        <div className="finance-balance">
          <span>{settings.hideBalance ? 'Rp ••••••••' : formatRupiah(totalBalance)}</span>
        </div>
        <p>
          Rasio hemat bulan ini: <strong>{savingsRate}%</strong> · {transactions.length} total catatan
        </p>
        <div className="hero-action-row">
          <button className="hero-glass-btn" onClick={() => openNewTx('expense')}>
            <Icon name="arrow-up-right" size={15} /> Catat Pengeluaran
          </button>
          <button className="hero-glass-btn mint-glass" onClick={() => openNewTx('income')}>
            <Icon name="arrow-down-left" size={15} /> Catat Pemasukan
          </button>
        </div>
        <div className="finance-hero-decoration">
          <span />
          <span />
          <span />
        </div>
      </section>

      <section className="summary-grid finance-summary-grid">
        <article className="surface-card summary-card">
          <div className="card-top">
            <span className="summary-icon coral">
              <Icon name="arrow-up-right" size={18} />
            </span>
            <span className="card-kicker">PENGELUARAN</span>
          </div>
          <div className="summary-value compact">
            {settings.hideBalance ? 'Rp ••••••' : formatRupiah(monthExpense, true)}
          </div>
          <p className="summary-caption">Bulan ini</p>
        </article>
        <article className="surface-card summary-card">
          <div className="card-top">
            <span className="summary-icon mint">
              <Icon name="arrow-down-left" size={18} />
            </span>
            <span className="card-kicker">PEMASUKAN</span>
          </div>
          <div className="summary-value compact">
            {settings.hideBalance ? 'Rp ••••••' : formatRupiah(monthIncome, true)}
          </div>
          <p className="summary-caption">Bulan ini</p>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OVERVIEW 7 HARI</p>
            <h2>Arus keuangan</h2>
          </div>
          <span className="muted-pill">Masuk vs Keluar</span>
        </div>
        <div className="surface-card chart-placeholder">
          <div className="chart-bars dynamic-bars" aria-label="Grafik arus kas 7 hari terakhir">
            {chartData.daily.map((d) => {
              const incHeight = d.income > 0 ? Math.max(6, Math.round((d.income / chartData.maxVal) * 100)) : 0
              const expHeight = d.expense > 0 ? Math.max(6, Math.round((d.expense / chartData.maxVal) * 100)) : 0
              return (
                <div
                  key={d.dayKey}
                  className="bar-group"
                  title={`${formatShortDate(d.dayKey)}: +${formatRupiah(d.income)} / -${formatRupiah(d.expense)}`}
                >
                  <div className="bar-pair">
                    <span className="bar-col income-bar" style={{ height: `${incHeight}%` }} />
                    <span className="bar-col expense-bar" style={{ height: `${expHeight}%` }} />
                  </div>
                  <span className="bar-day">{d.label}</span>
                </div>
              )
            })}
          </div>
          <div className="chart-caption">
            <span className="chart-legend-inline">
              <i className="dot-inc" /> Pemasukan &nbsp;&nbsp; <i className="dot-exp" /> Pengeluaran
            </span>
            <Icon name="chart" size={17} />
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TRANSACTION LOG</p>
            <h2>Transaksi terbaru</h2>
          </div>
          <div className="filter-pills">
            {(['all', 'expense', 'income'] as const).map((f) => (
              <button
                key={f}
                className={`mini-filter ${filterType === f ? 'active' : ''}`}
                onClick={() => { setFilterType(f); setVisibleTransactionLimit(50) }}
              >
                {f === 'all' ? 'Semua' : f === 'expense' ? 'Keluar' : 'Masuk'}
              </button>
            ))}
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="surface-card transaction-empty">
            <span className="transaction-empty-icon">
              <Icon name="receipt" size={22} />
            </span>
            <h3>Belum ada catatan</h3>
            <p>Mulai catat pemasukan atau pengeluaran harianmu untuk memantau kesehatan keuangan.</p>
            <button className="primary-button" onClick={() => openNewTx('expense')}>
              <Icon name="plus" size={16} /> Catat Transaksi
            </button>
          </div>
        ) : (
          <div className="item-list">
            {visibleTransactions.map((tx) => (
              <div key={tx.id} className="surface-card task-row">
                <span className={`summary-icon ${tx.type === 'income' ? 'mint' : 'coral'}`}>
                  <Icon name={tx.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'} size={17} />
                </span>
                <div className="task-info">
                  <div className="task-title-line">
                    <span className="task-title">{tx.title}</span>
                    <span className={`tx-amount ${tx.type === 'income' ? 'text-mint' : 'text-coral'}`}>
                      {settings.hideBalance
                        ? '••••'
                        : `${tx.type === 'income' ? '+' : '-'}${formatRupiah(tx.amount)}`}
                    </span>
                  </div>
                  <div className="task-meta">
                    <span className="category-tag">{tx.category}</span>
                    <span>{formatShortDate(tx.date)}</span>
                  </div>
                </div>
                <button
                  className="ghost-icon-btn"
                  onClick={() => deleteTransaction(tx.id)}
                  aria-label="Hapus transaksi"
                  title="Hapus"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {visibleTransactionLimit < filteredTransactions.length && (
          <button type="button" className="secondary-button full-width" onClick={() => setVisibleTransactionLimit((limit) => limit + 50)}>
            Muat 50 transaksi berikutnya ({filteredTransactions.length - visibleTransactionLimit} tersisa)
          </button>
        )}
      </section>

      <Modal
        open={txModalOpen}
        title={txType === 'expense' ? 'Catat Pengeluaran' : 'Catat Pemasukan'}
        subtitle="Otomatis memperbarui saldo & anggaran harian"
        onClose={() => setTxModalOpen(false)}
      >
        <form className="form-stack" onSubmit={handleAddTransaction}>
          <div className="segmented-control">
            <button
              type="button"
              className={txType === 'expense' ? 'active' : ''}
              onClick={() => {
                setTxType('expense')
                setTxCategory('Makan & Minum')
              }}
            >
              Pengeluaran
            </button>
            <button
              type="button"
              className={txType === 'income' ? 'active' : ''}
              onClick={() => {
                setTxType('income')
                setTxCategory('Gaji & Bonus')
              }}
            >
              Pemasukan
            </button>
          </div>

          <label className="field-label">
            <span>Nominal (Rp)</span>
            <input
              type="number"
              min={100}
              max={9007199254740991}
              step={100}
              className="text-input"
              placeholder="Contoh: 25000"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="field-label">
            <span>Keterangan</span>
            <input
              type="text"
              className="text-input"
              placeholder="Contoh: Makan siang / Gaji bulanan"
              value={txTitle}
              maxLength={120}
              onChange={(e) => setTxTitle(e.target.value)}
              required
            />
          </label>

          <div className="form-row-2">
            <label className="field-label">
              <span>Kategori</span>
              <select
                className="text-input"
                value={txCategory}
                onChange={(e) => setTxCategory(e.target.value as TransactionCategory)}
              >
                {(txType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              <span>Tanggal</span>
              <input
                type="date"
                className="text-input"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                required
              />
            </label>
          </div>

          <button type="submit" className="primary-button full-width">
            <Icon name="check" size={16} /> Simpan Transaksi
          </button>
        </form>
      </Modal>

      <Modal
        open={backupModalOpen}
        title="Manajemen Data, Backup & Reset"
        subtitle="Cadangkan data atau mulai ulang dari nol (0)"
        onClose={() => setBackupModalOpen(false)}
      >
        <div className="form-stack">
          <p className="modal-desc">
            Semua data FokusTrack tersimpan secara privat di perangkatmu. Gunakan opsi di bawah untuk mencadangkan data atau mengulang streak dari 0.
          </p>
          <button type="button" className="primary-button full-width" onClick={handleDownloadBackup}>
            <Icon name="download" size={16} /> Unduh Backup JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleRestoreFile}
          />
          <button
            type="button"
            className="secondary-button full-width"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="upload" size={16} /> Pulihkan dari File JSON
          </button>
          <button
            type="button"
            className="secondary-button full-width"
            onClick={() => {
              loadSampleData()
              setBackupStatus('Contoh jadwal & transaksi berhasil ditambahkan.')
            }}
          >
            <Icon name="sparkles" size={16} /> Isi Contoh Data Awal
          </button>
          <div className="form-row-2">
            <button
              type="button"
              className="secondary-button full-width"
              onClick={() => {
                resetStreakOnly()
                setBackupStatus('Streak direset. Riwayat fokus dan status tugas tetap tersimpan.')
              }}
            >
              <Icon name="rotate-ccw" size={15} /> Reset Streak (0)
            </button>
            <button
              type="button"
              className="secondary-button danger-btn full-width"
              onClick={() => {
                const confirmed = window.confirm('Hapus seluruh jadwal, transaksi, riwayat fokus, dan pengaturan? Tindakan ini tidak dapat dibatalkan. Unduh backup terlebih dahulu bila diperlukan.')
                if (!confirmed) return
                resetAllData()
                setBackupStatus('Seluruh data berhasil direset.')
              }}
            >
              <Icon name="trash" size={15} /> Reset Semua Data
            </button>
          </div>
          {backupStatus && <div className="toast-banner">{backupStatus}</div>}
        </div>
      </Modal>
    </div>
  )
}
