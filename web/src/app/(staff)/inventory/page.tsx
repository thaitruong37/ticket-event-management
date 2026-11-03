'use client'

import { Alert, App, Button, Form, Input, Modal, Select, Space, Table } from 'antd'
import { useMemo, useState } from 'react'
import { postJson, useApi } from '@/components/staff-api'
import type { EventRecord, Purchase, SessionRecord, Ticket, Tier } from '@/components/staff-types'
import { Loadable, money, PageHeader, StatusTag } from '@/components/staff-ui'

export default function InventoryPage() {
  const { message } = App.useApp()
  const tickets = useApi<Ticket[]>('/api/tickets', [])
  const purchases = useApi<Purchase[]>('/api/purchases', [])
  const sessions = useApi<SessionRecord[]>('/api/sessions', [])
  const events = useApi<EventRecord[]>('/api/events', [])
  const tiers = useApi<Tier[]>('/api/tiers', [])
  const [status, setStatus] = useState<string>()
  const [query, setQuery] = useState('')
  const [verifying, setVerifying] = useState<Ticket | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<{ evidenceReference: string }>()

  const filtered = useMemo(() => tickets.data.filter(ticket => {
    const text = `${ticket.section ?? ''} ${ticket.row ?? ''} ${ticket.seat ?? ''}`.toLocaleLowerCase('vi')
    return (!status || (ticket.status ?? ticket.state) === status) && (!query.trim() || text.includes(query.trim().toLocaleLowerCase('vi')))
  }), [query, status, tickets.data])

  const verify = async () => {
    if (!verifying) return
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await postJson(`/api/tickets/${verifying.id}/verify`, { evidenceReference: values.evidenceReference.trim() })
      message.success('Đã gửi bằng chứng xác minh tới máy chủ')
      setVerifying(null); form.resetFields(); await tickets.reload()
    } catch (reason) { if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể xác minh vé') }
    finally { setSubmitting(false) }
  }

  const sessionFor = (ticket: Ticket) => sessions.data.find(item => item.id === (ticket.eventSessionId ?? ticket.sessionId))
  const loading = [tickets, purchases, sessions, events, tiers].some(item => item.loading)
  const error = tickets.error || purchases.error || sessions.error || events.error || tiers.error

  return <>
    <PageHeader eyebrow="Tồn kho" title="Kho vé" description="Kiểm tra vị trí, giá và trạng thái sẵn sàng. QR, mã vạch, artifact và tham chiếu xác thực không được hiển thị." />
    <Alert className="page-alert" type="info" showIcon title="Điều kiện mở bán" description="Máy chủ chỉ đánh dấu vé sẵn sàng khi lần mua đã xác nhận, hạng vé có trạng thái chuyển verified và bằng chứng xác minh hợp lệ đã được ghi nhận." />
    <Loadable loading={loading} error={error} onRetry={() => { void tickets.reload(); void purchases.reload(); void sessions.reload(); void events.reload(); void tiers.reload() }} empty={!tickets.data.length} emptyText="Kho chưa có vé">
      <section className="panel">
        <div className="table-toolbar"><Input.Search allowClear aria-label="Tìm theo vị trí" placeholder="Tìm khu, hàng hoặc ghế" value={query} onChange={event => setQuery(event.target.value)} style={{ width: 300 }} /><Select allowClear placeholder="Trạng thái" value={status} onChange={setStatus} style={{ width: 180 }} options={['preparing', 'available', 'held', 'sold', 'blocked', 'void'].map(value => ({ value, label: value }))} /></div>
        <Table rowKey={row => row.id} dataSource={filtered} scroll={{ x: 980 }} pagination={{ pageSize: 20, showTotal: total => `${total} vé` }} columns={[
          { title: 'Sự kiện', render: (_, ticket) => { const session = sessionFor(ticket); const event = events.data.find(item => item.id === session?.eventId); return <div><strong>{event?.name ?? 'Không xác định'}</strong><div className="table-subtext">{session?.name ?? 'Chưa rõ suất'}</div></div> } },
          { title: 'Vị trí', render: (_, ticket) => [ticket.section, ticket.row, ticket.seat].filter(Boolean).join(' · ') || 'Vé GA' },
          { title: 'Giá vốn', dataIndex: 'costVnd', align: 'right', render: (value, row) => money(value ?? row.cost) },
          { title: 'Giá bán', dataIndex: 'askingPriceVnd', align: 'right', render: (value, row) => <strong>{money(value ?? row.price)}</strong> },
          { title: 'Trạng thái', dataIndex: 'status', render: (value, row) => <StatusTag value={value ?? row.state} /> },
          { title: 'Thao tác', fixed: 'right', width: 140, render: (_, ticket) => <Button disabled={(ticket.status ?? ticket.state) !== 'preparing'} onClick={() => { setVerifying(ticket); form.resetFields() }}>Xác minh</Button> },
        ]} />
      </section>
    </Loadable>
    <Modal title="Xác minh khả năng giao vé" open={!!verifying} onCancel={() => setVerifying(null)} footer={<Space><Button onClick={() => setVerifying(null)}>Hủy</Button><Button type="primary" loading={submitting} onClick={() => void verify()}>Gửi xác minh</Button></Space>}>
      <p className="muted">Chỉ nhập mã tham chiếu tới bằng chứng lưu trong hệ thống được phê duyệt. Không dán QR, mã vạch hoặc thông tin đăng nhập.</p>
      <Form form={form} layout="vertical" requiredMark={false}><Form.Item name="evidenceReference" label="Tham chiếu bằng chứng" rules={[{ required: true, message: 'Nhập tham chiếu bằng chứng' }]}><Input autoComplete="off" /></Form.Item></Form>
    </Modal>
  </>
}
