'use client'

import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs } from 'antd'
import { useState } from 'react'
import { postJson, useApi } from '@/components/staff-api'
import type { Account, EventRecord, Purchase, SessionRecord, Ticket, Tier } from '@/components/staff-types'
import { Loadable, money, PageHeader, StatusTag } from '@/components/staff-ui'

export default function PurchasesPage() {
  const { message } = App.useApp()
  const purchases = useApi<Purchase[]>('/api/purchases', [])
  const tickets = useApi<Ticket[]>('/api/tickets', [])
  const accounts = useApi<Account[]>('/api/accounts', [])
  const events = useApi<EventRecord[]>('/api/events', [])
  const sessions = useApi<SessionRecord[]>('/api/sessions', [])
  const tiers = useApi<Tier[]>('/api/tiers', [])
  const [purchaseForm] = Form.useForm()
  const [ticketForm] = Form.useForm()
  const [saving, setSaving] = useState('')
  const [confirming, setConfirming] = useState<Purchase | null>(null)
  const [confirmForm] = Form.useForm<{ evidenceReference: string }>()
  const selectedPurchaseId = Form.useWatch('purchaseId', ticketForm)
  const confirmedPurchases = purchases.data.filter(item => item.status === 'confirmed')
  const selectedPurchase = confirmedPurchases.find(item => item.id === selectedPurchaseId)
  const eligibleTiers = tiers.data.filter(item => item.eventSessionId === selectedPurchase?.eventSessionId)

  const submitPurchase = async () => {
    try {
      const values = await purchaseForm.validateFields()
      setSaving('purchase')
      await postJson('/api/purchases', { sourceAccountId: values.sourceAccountId, eventSessionId: values.eventSessionId, externalReference: values.externalReference.trim(), totalCostVnd: values.totalCostVnd })
      purchaseForm.resetFields(); message.success('Đã ghi nhận lần mua'); await purchases.reload()
    } catch (reason) { if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể lưu lần mua') }
    finally { setSaving('') }
  }
  const submitTicket = async () => {
    try {
      const values = await ticketForm.validateFields()
      setSaving('ticket')
      await postJson('/api/tickets', {
        purchaseId: values.purchaseId,
        ticketTierId: values.ticketTierId,
        externalReference: values.externalReference.trim(),
        section: values.section?.trim() || undefined,
        row: values.row?.trim() || undefined,
        seat: values.seat?.trim() || undefined,
        costVnd: values.costVnd,
        askingPriceVnd: values.askingPriceVnd,
      })
      ticketForm.resetFields(); message.success('Đã nhập vé ở trạng thái chuẩn bị'); await tickets.reload()
    } catch (reason) { if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể nhập vé') }
    finally { setSaving('') }
  }

  const confirmPurchase = async () => {
    if (!confirming) return
    try {
      const values = await confirmForm.validateFields()
      setSaving(`confirm-${confirming.id}`)
      await postJson(`/api/purchases/${confirming.id}/confirm`, { evidenceReference: values.evidenceReference.trim() })
      message.success('Đã xác nhận lần mua')
      setConfirming(null); confirmForm.resetFields(); await purchases.reload()
    } catch (reason) { if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể xác nhận lần mua') }
    finally { setSaving('') }
  }

  const accountName = (id: unknown) => accounts.data.find(row => row.id === id)?.label ?? 'Không xác định'
  const sessionName = (id: unknown) => { const session = sessions.data.find(row => row.id === id); const event = events.data.find(row => row.id === session?.eventId); return session ? `${event?.name ?? 'Sự kiện'} · ${session.name ?? 'Suất diễn'}` : 'Không xác định' }
  const loading = [purchases, tickets, accounts, events, sessions, tiers].some(query => query.loading)
  const error = purchases.error || tickets.error || accounts.error || events.error || sessions.error || tiers.error

  return <>
    <PageHeader eyebrow="Nhập nguồn" title="Lần mua & nhập vé" description="Ghi nhận nguồn mua và từng vé. Vé chỉ sẵn sàng sau khi nguồn mua được xác nhận, khả năng chuyển đã được xác minh và có bằng chứng kiểm tra." />
    <section className="panel create-panel"><Tabs items={[
      { key: 'purchase', label: 'Ghi nhận lần mua', children: <Form form={purchaseForm} layout="vertical" requiredMark={false} onFinish={() => void submitPurchase()}>
        <div className="form-grid two"><Form.Item name="sourceAccountId" label="Tài khoản nguồn" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={accounts.data.map(item => ({ value: item.id, label: `${item.label ?? item.id} · ${item.accountReference ?? ''}` }))} /></Form.Item><Form.Item name="eventSessionId" label="Suất diễn" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={sessions.data.map(item => ({ value: item.id, label: sessionName(item.id) }))} /></Form.Item></div>
        <div className="form-grid two"><Form.Item name="externalReference" label="Tham chiếu bên ngoài" rules={[{ required: true, message: 'Nhập tham chiếu lần mua' }]}><Input autoComplete="off" /></Form.Item><Form.Item name="totalCostVnd" label="Tổng giá vốn" rules={[{ required: true }]}><InputNumber min={0} precision={0} addonAfter="₫" style={{ width: '100%' }} /></Form.Item></div>
        <Button type="primary" htmlType="submit" loading={saving === 'purchase'} disabled={!accounts.data.length || !sessions.data.length}>Lưu lần mua</Button>
      </Form> },
      { key: 'ticket', label: 'Nhập vé', children: <Form form={ticketForm} layout="vertical" requiredMark={false} onFinish={() => void submitTicket()}>
        <p className="form-note">Không tải lên hoặc hiển thị QR, mã vạch hay thông tin xác thực vé. Tham chiếu bên ngoài chỉ dùng để đối chiếu nội bộ.</p>
        <div className="form-grid two"><Form.Item name="purchaseId" label="Lần mua" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" onChange={() => ticketForm.setFieldValue('ticketTierId', undefined)} options={confirmedPurchases.map(item => ({ value: item.id, label: `${item.externalReference ?? item.reference ?? item.id} · ${sessionName(item.eventSessionId)}` }))} /></Form.Item><Form.Item name="ticketTierId" label="Hạng vé" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={eligibleTiers.map(item => ({ value: item.id, label: `${item.name ?? item.id} · ${item.transferStatus ?? 'unverified'}` }))} /></Form.Item></div>
        <div className="form-grid two"><Form.Item name="externalReference" label="Tham chiếu vé bên ngoài" rules={[{ required: true, message: 'Nhập tham chiếu vé' }]}><Input autoComplete="off" /></Form.Item><div /></div>
        <div className="form-grid three"><Form.Item name="section" label="Khu"><Input autoComplete="off" /></Form.Item><Form.Item name="row" label="Hàng"><Input autoComplete="off" /></Form.Item><Form.Item name="seat" label="Ghế"><Input autoComplete="off" /></Form.Item></div>
        <div className="form-grid two"><Form.Item name="costVnd" label="Giá vốn" rules={[{ required: true }]}><InputNumber min={0} precision={0} addonAfter="₫" style={{ width: '100%' }} /></Form.Item><Form.Item name="askingPriceVnd" label="Giá bán" rules={[{ required: true }]}><InputNumber min={0} precision={0} addonAfter="₫" style={{ width: '100%' }} /></Form.Item></div>
        <Button type="primary" htmlType="submit" loading={saving === 'ticket'} disabled={!confirmedPurchases.length}>Nhập vé</Button>
      </Form> },
    ]} /></section>
    <Loadable loading={loading} error={error} onRetry={() => { void purchases.reload(); void tickets.reload(); void accounts.reload(); void events.reload(); void sessions.reload(); void tiers.reload() }}>
      <div className="two-column">
        <section className="panel"><div className="section-heading"><h2>Lần mua</h2><span className="muted">{purchases.data.length} bản ghi</span></div><Table size="small" rowKey={row => row.id} dataSource={purchases.data} pagination={{ pageSize: 10 }} columns={[{ title: 'Tham chiếu', dataIndex: 'externalReference', render: (value, row) => <strong>{String(value ?? row.reference ?? '—')}</strong> }, { title: 'Tài khoản', dataIndex: 'sourceAccountId', render: (value, row) => accountName(value ?? row.accountId) }, { title: 'Suất diễn', dataIndex: 'eventSessionId', render: sessionName }, { title: 'Tổng vốn', dataIndex: 'totalCostVnd', align: 'right', render: money }, { title: 'Trạng thái', dataIndex: 'status', render: value => <StatusTag value={value} /> }, { title: '', render: (_, row) => <Button size="small" disabled={row.status !== 'pending'} onClick={() => { setConfirming(row); confirmForm.resetFields() }}>Xác nhận</Button> }]} /></section>
        <section className="panel"><div className="section-heading"><h2>Vé đã nhập</h2><span className="muted">Không hiển thị thông tin xác thực</span></div><Table size="small" rowKey={row => row.id} dataSource={tickets.data} pagination={{ pageSize: 10 }} columns={[{ title: 'Vị trí', render: (_, row) => [row.section, row.row, row.seat].filter(Boolean).join(' · ') || 'Vé GA' }, { title: 'Giá bán', dataIndex: 'askingPriceVnd', align: 'right', render: (value, row) => money(value ?? row.price) }, { title: 'Trạng thái', dataIndex: 'status', render: (value, row) => <StatusTag value={value ?? row.state} /> }]} /></section>
      </div>
    </Loadable>
    <Modal title="Xác nhận lần mua" open={!!confirming} onCancel={() => setConfirming(null)} footer={<Space><Button onClick={() => setConfirming(null)}>Hủy</Button><Button type="primary" loading={!!confirming && saving === `confirm-${confirming.id}`} onClick={() => void confirmPurchase()}>Xác nhận</Button></Space>}><p className="muted">Nhập tham chiếu đến bằng chứng mua hợp lệ. Không nhập mật khẩu hoặc thông tin đăng nhập tài khoản nguồn.</p><Form form={confirmForm} layout="vertical" requiredMark={false}><Form.Item name="evidenceReference" label="Tham chiếu bằng chứng" rules={[{ required: true }, { min: 4 }]}><Input autoComplete="off" /></Form.Item></Form></Modal>
  </>
}
