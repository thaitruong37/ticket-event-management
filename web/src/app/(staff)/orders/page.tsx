'use client'

import { Alert, App, Button, Checkbox, Form, Input, Modal, Select, Space, Table } from 'antd'
import { useState } from 'react'
import { postJson, useApi } from '@/components/staff-api'
import type { Order, Ticket } from '@/components/staff-types'
import { dateTime, Loadable, money, PageHeader, StatusTag } from '@/components/staff-ui'

interface DeliveryValues { recipientName: string; references: Record<string, string>; evidenceAttested: boolean }

export default function OrdersPage() {
  const { message, modal } = App.useApp()
  const orders = useApi<Order[]>('/api/orders', [])
  const tickets = useApi<Ticket[]>('/api/tickets', [])
  const [orderForm] = Form.useForm()
  const [deliveryForm] = Form.useForm<DeliveryValues>()
  const [saving, setSaving] = useState('')
  const [delivering, setDelivering] = useState<Order | null>(null)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  const available = tickets.data.filter(ticket => (ticket.status ?? ticket.state) === 'available')

  const create = async () => {
    try {
      const values = await orderForm.validateFields()
      setSaving('create')
      await postJson('/api/orders', { ticketIds: values.ticketIds, customerName: values.customerName.trim(), customerEmail: values.customerEmail.trim(), customerPhone: values.customerPhone.trim() })
      orderForm.resetFields(); message.success('Đã tạo đơn và giữ vé theo quy tắc của máy chủ'); await Promise.all([orders.reload(), tickets.reload()])
    } catch (reason) { if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể tạo đơn') }
    finally { setSaving('') }
  }

  const createPaymentLink = async (order: Order) => {
    try {
      setSaving(`pay-${order.id}`)
      const result = await postJson<Record<string, unknown>>(`/api/orders/${order.id}/payment-link`, {})
      const url = [result.checkoutUrl, result.paymentUrl, result.url].find(value => typeof value === 'string')
      if (typeof url === 'string') setPaymentLink(url)
      else message.success('Đã yêu cầu tạo liên kết thanh toán')
      await orders.reload()
    } catch (reason) { message.error(reason instanceof Error ? reason.message : 'Không thể tạo liên kết') }
    finally { setSaving('') }
  }

  const deliver = async () => {
    if (!delivering) return
    try {
      const values = await deliveryForm.validateFields()
      setSaving(`deliver-${delivering.id}`)
      const ticketIds = delivering.ticketIds ?? []
      if (!ticketIds.length) throw new Error('Không có danh sách vé của đơn. Vui lòng tải lại trang.')
      await postJson(`/api/orders/${delivering.id}/deliver`, {
        method: 'official_transfer',
        recipientName: values.recipientName.trim(),
        evidenceAttested: values.evidenceAttested,
        deliveries: ticketIds.map(ticketId => ({ ticketId, evidenceReference: values.references[ticketId]?.trim() })),
      })
      message.success('Đã xác nhận giao từng vé với bằng chứng riêng'); setDelivering(null); deliveryForm.resetFields(); await Promise.all([orders.reload(), tickets.reload()])
    } catch (reason) { if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể giao đơn') }
    finally { setSaving('') }
  }

  const cancel = (order: Order) => modal.confirm({
    title: `Hủy đơn ${order.orderCode ?? order.reference ?? order.id}?`,
    content: 'Chỉ hủy trực tiếp khi chưa từng tạo yêu cầu thanh toán. Nếu đã tạo link payOS, phải chờ đối soát nhà cung cấp trước khi nhả vé.',
    okText: 'Hủy đơn', cancelText: 'Quay lại', okButtonProps: { danger: true },
    onOk: async () => { try { setSaving(`cancel-${order.id}`); await postJson(`/api/orders/${order.id}/cancel`, {}); message.success('Đã gửi yêu cầu hủy đơn'); await Promise.all([orders.reload(), tickets.reload()]) } catch (reason) { message.error(reason instanceof Error ? reason.message : 'Không thể hủy đơn'); throw reason } finally { setSaving('') } },
  })

  return <>
    <PageHeader eyebrow="Bán hàng" title="Đơn hàng" description="Tạo đơn từ vé sẵn sàng, phát hành liên kết thanh toán và ghi nhận giao vé có bằng chứng." />
    <Alert className="page-alert" type="warning" showIcon title="Không xác nhận tiền từ trang quay lại" description="Việc khách quay lại sau thanh toán không đồng nghĩa đã nhận tiền. Chỉ trạng thái do webhook hoặc đối soát máy chủ xác minh mới được coi là đã thanh toán." />
    <section className="panel create-panel"><div className="section-heading"><div><span className="eyebrow">Tạo mới</span><h2>Tạo đơn hàng</h2></div></div>
      <Form form={orderForm} layout="vertical" requiredMark={false} onFinish={() => void create()}>
        <Form.Item name="ticketIds" label="Vé sẵn sàng" rules={[{ required: true, message: 'Chọn ít nhất một vé' }]}><Select mode="multiple" showSearch optionFilterProp="label" maxTagCount="responsive" options={available.map(ticket => ({ value: ticket.id, label: `${[ticket.section, ticket.row, ticket.seat].filter(Boolean).join(' · ') || 'Vé GA'} · ${money(ticket.askingPriceVnd ?? ticket.price)}` }))} /></Form.Item>
        <div className="form-grid three"><Form.Item name="customerName" label="Tên khách" rules={[{ required: true }]}><Input autoComplete="name" /></Form.Item><Form.Item name="customerEmail" label="Email" rules={[{ required: true }, { type: 'email', message: 'Email chưa hợp lệ' }]}><Input type="email" autoComplete="email" /></Form.Item><Form.Item name="customerPhone" label="Điện thoại" rules={[{ required: true }]}><Input type="tel" autoComplete="tel" /></Form.Item></div>
        <Button type="primary" htmlType="submit" loading={saving === 'create'} disabled={!available.length}>Tạo đơn</Button>
      </Form>
    </section>
    <Loadable loading={orders.loading || tickets.loading} error={orders.error || tickets.error} onRetry={() => { void orders.reload(); void tickets.reload() }} empty={!orders.data.length} emptyText="Chưa có đơn hàng">
      <section className="panel"><Table rowKey={row => row.id} dataSource={orders.data} scroll={{ x: 1180 }} pagination={{ pageSize: 20, showTotal: total => `${total} đơn` }} columns={[
        { title: 'Đơn', render: (_, order) => <div><strong className="mono">#{order.orderCode ?? order.reference ?? order.id.slice(0, 8)}</strong><div className="table-subtext">{dateTime(order.createdAt)}</div></div> },
        { title: 'Khách hàng', dataIndex: 'customerName', render: (value, order) => <div><strong>{String(value ?? '—')}</strong><div className="table-subtext">{order.customerEmail ?? order.customerPhone ?? ''}</div></div> },
        { title: 'Tổng tiền', dataIndex: 'totalVnd', align: 'right', render: (value, order) => <strong>{money(value ?? order.total)}</strong> },
        { title: 'Trạng thái', dataIndex: 'status', render: value => <StatusTag value={value} /> },
        { title: 'Thanh toán', render: (_, order) => <StatusTag value={order.paymentStatus ?? order.paymentState ?? (order.status === 'paid' || order.status === 'fulfilled' ? 'paid' : 'unpaid')} /> },
        { title: 'Giao vé', render: (_, order) => <StatusTag value={order.deliveryStatus ?? order.deliveryState ?? (order.status === 'fulfilled' ? 'delivered' : 'pending')} /> },
        { title: 'Thao tác', fixed: 'right', width: 300, render: (_, order) => <Space wrap><Button loading={saving === `pay-${order.id}`} disabled={['cancelled', 'expired', 'fulfilled', 'refunded'].includes(order.status ?? '')} onClick={() => void createPaymentLink(order)}>Liên kết TT</Button><Button loading={saving === `deliver-${order.id}`} disabled={order.status !== 'paid'} onClick={() => { setDelivering(order); deliveryForm.resetFields() }}>Giao vé</Button><Button danger loading={saving === `cancel-${order.id}`} disabled={['cancelled', 'fulfilled', 'refunded'].includes(order.status ?? '')} onClick={() => cancel(order)}>Hủy</Button></Space> },
      ]} /></section>
    </Loadable>
    <Modal title="Xác nhận giao từng vé" open={!!delivering} onCancel={() => setDelivering(null)} footer={<Space><Button onClick={() => setDelivering(null)}>Hủy</Button><Button type="primary" loading={!!delivering && saving === `deliver-${delivering.id}`} onClick={() => void deliver()}>Xác nhận giao</Button></Space>}><p className="muted">Chỉ xác nhận sau khi đã chuyển vé qua kênh chính thức. Không dán QR, mã vé hoặc thông tin đăng nhập; mỗi vé cần tham chiếu bằng chứng riêng.</p><Form form={deliveryForm} layout="vertical" requiredMark={false}><Form.Item name="recipientName" label="Người nhận" rules={[{ required: true, message: 'Nhập người nhận' }]}><Input autoComplete="off" /></Form.Item>{(delivering?.ticketIds ?? []).map((ticketId, index) => <Form.Item key={ticketId} name={['references', ticketId]} label={`Bằng chứng giao vé ${index + 1} · ${ticketId.slice(0, 8)}`} rules={[{ required: true, message: 'Mỗi vé cần bằng chứng riêng' }]}><Input autoComplete="off" /></Form.Item>)}<Form.Item name="evidenceAttested" valuePropName="checked" rules={[{ validator: (_, value) => value === true ? Promise.resolve() : Promise.reject(new Error('Cần xác nhận đã giao qua kênh chính thức')) }]}><Checkbox>Tôi xác nhận đã chuyển từng vé cho người nhận và kiểm tra bằng chứng</Checkbox></Form.Item></Form></Modal>
    <Modal title="Liên kết thanh toán" open={!!paymentLink} onCancel={() => setPaymentLink(null)} footer={<Button onClick={() => setPaymentLink(null)}>Đóng</Button>}><Alert type="info" showIcon title="Chỉ là liên kết yêu cầu thanh toán" description="Mở hoặc quay lại từ liên kết này không xác nhận tiền đã về. Hãy chờ webhook hoặc đối soát." /><Input className="payment-link-input" readOnly value={paymentLink ?? ''} addonAfter={<Button type="link" onClick={() => { if (paymentLink) void navigator.clipboard.writeText(paymentLink).then(() => message.success('Đã sao chép liên kết')) }}>Sao chép</Button>} /></Modal>
  </>
}
