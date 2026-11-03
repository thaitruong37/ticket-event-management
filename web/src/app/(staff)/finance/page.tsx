'use client'

import { Alert, Descriptions, Table, Tabs } from 'antd'
import { useApi } from '@/components/staff-api'
import { Loadable, money, PageHeader, StatusTag, dateTime } from '@/components/staff-ui'

type Item = Record<string, unknown> & { id?: string }
interface Finance {
  summary?: { grossPaidVnd?: number; paidOrders?: number; awaitingPaymentVnd?: number; awaitingPaymentOrders?: number; paymentReviewOrders?: number; openCases?: number }
  paymentEvents?: Item[]
  paymentLinks?: Item[]
  cases?: Item[]
}

export default function FinancePage() {
  const finance = useApi<Finance>('/api/finance', {})
  const cases = useApi<Item[]>('/api/cases', [])
  const summary = finance.data.summary ?? {}
  const caseRows = cases.data.length ? cases.data : finance.data.cases ?? []

  return <>
    <PageHeader eyebrow="Đối soát" title="Tài chính & hồ sơ xử lý" description="Theo dõi số liệu do máy chủ tổng hợp, sự kiện thanh toán và các trường hợp cần kiểm tra thủ công." />
    <Alert className="page-alert" type="info" showIcon title="Nguồn sự thật là máy chủ" description="Chỉ webhook đã xác minh, đối soát hoặc nghiệp vụ được ghi nhận mới thay đổi trạng thái thanh toán. URL quay lại không phải bằng chứng nhận tiền." />
    <Loadable loading={finance.loading || cases.loading} error={finance.error || cases.error} onRetry={() => { void finance.reload(); void cases.reload() }}>
      <section className="panel" aria-labelledby="finance-summary"><div className="section-heading"><div><span className="eyebrow">Tổng hợp</span><h2 id="finance-summary">Số liệu tài chính</h2></div><span className="muted">Từ các giao dịch đã xác minh</span></div>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
          { key: 'paid', label: 'Doanh thu đã xác minh', children: <strong>{money(summary.grossPaidVnd ?? 0)}</strong> },
          { key: 'paidOrders', label: 'Đơn đã thanh toán', children: <strong>{summary.paidOrders ?? 0}</strong> },
          { key: 'awaiting', label: 'Giá trị đang chờ', children: <strong>{money(summary.awaitingPaymentVnd ?? 0)}</strong> },
          { key: 'awaitingOrders', label: 'Đơn chờ thanh toán', children: <strong>{summary.awaitingPaymentOrders ?? 0}</strong> },
          { key: 'review', label: 'Đơn cần đối soát', children: <strong>{summary.paymentReviewOrders ?? 0}</strong> },
          { key: 'cases', label: 'Hồ sơ đang mở', children: <strong>{summary.openCases ?? 0}</strong> },
        ]} />
      </section>
      <section className="panel"><Tabs items={[
        { key: 'cases', label: `Hồ sơ (${caseRows.length})`, children: <Table rowKey={row => String(row.id)} dataSource={caseRows} pagination={{ pageSize: 15 }} scroll={{ x: 900 }} columns={[
          { title: 'Hồ sơ', dataIndex: 'title', render: (value, row) => <div><strong>{String(value ?? row.type ?? 'Hồ sơ')}</strong><div className="table-subtext">{String(row.description ?? '')}</div></div> },
          { title: 'Loại', dataIndex: 'type', render: value => String(value ?? '—') }, { title: 'Trạng thái', dataIndex: 'status', render: value => <StatusTag value={value} /> },
          { title: 'Đơn liên quan', dataIndex: 'orderId', responsive: ['md'], render: value => value ? <span className="mono">{String(value).slice(0, 12)}…</span> : '—' }, { title: 'Tạo lúc', dataIndex: 'createdAt', render: dateTime },
        ]} /> },
        { key: 'events', label: `Sự kiện thanh toán (${finance.data.paymentEvents?.length ?? 0})`, children: <Table rowKey={row => String(row.id)} dataSource={finance.data.paymentEvents ?? []} pagination={{ pageSize: 15 }} scroll={{ x: 900 }} columns={[
          { title: 'Thời điểm', dataIndex: 'receivedAt', render: dateTime }, { title: 'Nguồn', dataIndex: 'source', render: value => String(value ?? '—') },
          { title: 'Trạng thái', dataIndex: 'status', render: value => <StatusTag value={value} /> }, { title: 'Số tiền', dataIndex: 'amountVnd', align: 'right', render: money },
          { title: 'Mã đơn', dataIndex: 'orderCode', render: value => value ? <span className="mono">#{String(value)}</span> : '—' },
        ]} /> },
        { key: 'links', label: `Yêu cầu thanh toán (${finance.data.paymentLinks?.length ?? 0})`, children: <Table rowKey={row => String(row.id)} dataSource={finance.data.paymentLinks ?? []} pagination={{ pageSize: 15 }} columns={[
          { title: 'Tạo lúc', dataIndex: 'createdAt', render: dateTime }, { title: 'Trạng thái', dataIndex: 'status', render: value => <StatusTag value={value} /> }, { title: 'Số tiền', dataIndex: 'amountVnd', align: 'right', render: money }, { title: 'Hết hạn', dataIndex: 'expiresAt', render: dateTime },
        ]} /> },
      ]} /></section>
    </Loadable>
  </>
}
