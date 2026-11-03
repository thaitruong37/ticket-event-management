'use client'

import { App, Button, Form, Input, InputNumber, Modal, Radio, Select, Space, Table, Tabs } from 'antd'
import { useState } from 'react'
import { postJson, useApi } from '@/components/staff-api'
import type { EventRecord, SessionRecord, Tier } from '@/components/staff-types'
import { dateTime, Loadable, money, PageHeader, StatusTag } from '@/components/staff-ui'

export default function EventsPage() {
  const { message } = App.useApp()
  const events = useApi<EventRecord[]>('/api/events', [])
  const sessions = useApi<SessionRecord[]>('/api/sessions', [])
  const tiers = useApi<Tier[]>('/api/tiers', [])
  const [saving, setSaving] = useState('')
  const [verifyingTier, setVerifyingTier] = useState<Tier | null>(null)
  const [eventForm] = Form.useForm()
  const [sessionForm] = Form.useForm()
  const [tierForm] = Form.useForm()
  const [verifyForm] = Form.useForm()
  const eventName = (id: unknown) => events.data.find(item => item.id === id)?.name ?? 'Không xác định'
  const sessionName = (id: unknown) => sessions.data.find(item => item.id === id)?.name ?? 'Không xác định'
  const eventOptions = events.data.map(item => ({ value: item.id, label: item.name ?? item.id }))
  const sessionOptions = sessions.data.map(item => ({ value: item.id, label: `${item.name ?? item.id} · ${eventName(item.eventId)}` }))

  const submit = async (kind: 'event' | 'session' | 'tier') => {
    const form = kind === 'event' ? eventForm : kind === 'session' ? sessionForm : tierForm
    const endpoint = kind === 'event' ? '/api/events' : kind === 'session' ? '/api/sessions' : '/api/tiers'
    try {
      const values = await form.validateFields(); setSaving(kind)
      const body = kind === 'session' ? { ...values, startsAt: new Date(values.startsAt).toISOString() } : values
      await postJson(endpoint, body); form.resetFields()
      message.success(kind === 'event' ? 'Đã tạo sự kiện nháp' : kind === 'session' ? 'Đã thêm suất diễn' : 'Đã thêm hạng vé chưa xác minh')
      await (kind === 'event' ? events.reload() : kind === 'session' ? sessions.reload() : tiers.reload())
    } catch (reason) { if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể lưu dữ liệu') }
    finally { setSaving('') }
  }

  const activateEvent = async (event: EventRecord) => {
    try { setSaving(`event-${event.id}`); await postJson(`/api/events/${event.id}/activate`, {}); message.success('Đã kích hoạt sự kiện'); await events.reload() }
    catch (reason) { message.error(reason instanceof Error ? reason.message : 'Không thể kích hoạt sự kiện') }
    finally { setSaving('') }
  }

  const verifyTier = async () => {
    if (!verifyingTier) return
    try { const values = await verifyForm.validateFields(); setSaving(`tier-${verifyingTier.id}`); await postJson(`/api/tiers/${verifyingTier.id}/verify`, { transferMethod: values.transferMethod.trim(), transferNotes: values.transferNotes.trim() }); message.success('Đã xác minh chính sách chuyển vé'); setVerifyingTier(null); verifyForm.resetFields(); await tiers.reload() }
    catch (reason) { if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể xác minh hạng vé') }
    finally { setSaving('') }
  }

  const loading = events.loading || sessions.loading || tiers.loading
  const error = events.error || sessions.error || tiers.error

  return <>
    <PageHeader eyebrow="Danh mục" title="Sự kiện, suất diễn & hạng vé" description="Tạo sự kiện nháp, cấu hình suất và hạng vé, sau đó xác minh chính sách chuyển trước khi mở bán." />
    <section className="panel create-panel"><Tabs items={[
      { key: 'event', label: 'Tạo sự kiện', children: <Form form={eventForm} layout="vertical" requiredMark={false} onFinish={() => void submit('event')}><div className="form-grid three"><Form.Item name="name" label="Tên sự kiện" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="venueName" label="Địa điểm"><Input /></Form.Item><Form.Item name="city" label="Thành phố"><Input /></Form.Item></div><Form.Item name="notes" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item><Button type="primary" htmlType="submit" loading={saving === 'event'}>Tạo bản nháp</Button></Form> },
      { key: 'session', label: 'Thêm suất diễn', children: <Form form={sessionForm} layout="vertical" requiredMark={false} onFinish={() => void submit('session')}><div className="form-grid three"><Form.Item name="eventId" label="Sự kiện" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={eventOptions} /></Form.Item><Form.Item name="name" label="Tên suất" rules={[{ required: true }]}><Input placeholder="Đêm 1" /></Form.Item><Form.Item name="startsAt" label="Bắt đầu lúc" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item></div><Button type="primary" htmlType="submit" loading={saving === 'session'} disabled={!events.data.length}>Thêm suất diễn</Button></Form> },
      { key: 'tier', label: 'Thêm hạng vé', children: <Form form={tierForm} layout="vertical" requiredMark={false} initialValues={{ isGeneralAdmission: true }} onFinish={() => void submit('tier')}><div className="form-grid three"><Form.Item name="eventSessionId" label="Suất diễn" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={sessionOptions} /></Form.Item><Form.Item name="name" label="Tên hạng" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="section" label="Khu mặc định"><Input /></Form.Item></div><div className="form-grid three"><Form.Item name="faceValueVnd" label="Mệnh giá"><InputNumber min={0} precision={0} addonAfter="₫" style={{ width: '100%' }} /></Form.Item><Form.Item name="suggestedPriceVnd" label="Giá bán đề xuất" rules={[{ required: true }]}><InputNumber min={1} precision={0} addonAfter="₫" style={{ width: '100%' }} /></Form.Item><Form.Item name="isGeneralAdmission" label="Kiểu chỗ" rules={[{ required: true }]}><Radio.Group options={[{ value: true, label: 'GA' }, { value: false, label: 'Ghế chỉ định' }]} /></Form.Item></div><Button type="primary" htmlType="submit" loading={saving === 'tier'} disabled={!sessions.data.length}>Thêm hạng vé</Button></Form> },
    ]} /></section>
    <Loadable loading={loading} error={error} onRetry={() => { void events.reload(); void sessions.reload(); void tiers.reload() }} empty={!events.data.length} emptyText="Chưa có sự kiện">
      <section className="panel"><div className="section-heading"><h2>Sự kiện</h2><span className="muted">Kích hoạt sau khi đã kiểm tra thông tin</span></div><Table rowKey={row => row.id} dataSource={events.data} pagination={false} scroll={{ x: 900 }} columns={[
        { title: 'Sự kiện', dataIndex: 'name', render: (value, row) => <div><strong>{String(value ?? 'Chưa đặt tên')}</strong><div className="table-subtext">{row.venueName ?? row.venue ?? 'Chưa có địa điểm'}{row.city ? ` · ${row.city}` : ''}</div></div> },
        { title: 'Trạng thái', dataIndex: 'status', render: value => <StatusTag value={value} /> },
        { title: 'Suất diễn', render: (_, row) => sessions.data.filter(item => item.eventId === row.id).length },
        { title: 'Thao tác', align: 'right', render: (_, row) => <Button disabled={row.status !== 'draft'} loading={saving === `event-${row.id}`} onClick={() => void activateEvent(row)}>Kích hoạt</Button> },
      ]} /></section>
      <div className="two-column"><section className="panel"><div className="section-heading"><h2>Suất diễn</h2></div><Table size="small" rowKey={row => row.id} dataSource={sessions.data} pagination={{ pageSize: 8 }} columns={[{ title: 'Suất', dataIndex: 'name' }, { title: 'Sự kiện', dataIndex: 'eventId', render: eventName }, { title: 'Bắt đầu', dataIndex: 'startsAt', render: dateTime }]} /></section>
      <section className="panel"><div className="section-heading"><h2>Hạng vé</h2></div><Table size="small" rowKey={row => row.id} dataSource={tiers.data} pagination={{ pageSize: 8 }} columns={[{ title: 'Hạng', dataIndex: 'name', render: (value, row) => <div>{String(value)}<div className="table-subtext">{sessionName(row.eventSessionId)}</div></div> }, { title: 'Giá', dataIndex: 'suggestedPriceVnd', align: 'right', render: money }, { title: 'Chuyển vé', dataIndex: 'transferStatus', render: value => <StatusTag value={value} /> }, { title: '', render: (_, row) => <Button size="small" disabled={row.transferStatus !== 'unverified'} onClick={() => { setVerifyingTier(row); verifyForm.resetFields() }}>Xác minh</Button> }]} /></section></div>
    </Loadable>
    <Modal title="Xác minh chính sách chuyển vé" open={!!verifyingTier} onCancel={() => setVerifyingTier(null)} footer={<Space><Button onClick={() => setVerifyingTier(null)}>Hủy</Button><Button type="primary" loading={!!verifyingTier && saving === `tier-${verifyingTier.id}`} onClick={() => void verifyTier()}>Xác minh</Button></Space>}><Form form={verifyForm} layout="vertical" requiredMark={false}><Form.Item name="transferMethod" label="Phương thức chuyển" rules={[{ required: true }, { min: 3 }]}><Input placeholder="Chuyển chính thức qua nền tảng" /></Form.Item><Form.Item name="transferNotes" label="Ghi chú kiểm tra" rules={[{ required: true }, { min: 8 }]}><Input.TextArea rows={4} placeholder="Mô tả cách đã kiểm tra chính sách chuyển" /></Form.Item></Form></Modal>
  </>
}
