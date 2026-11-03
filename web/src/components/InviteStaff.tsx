'use client'

import { Alert, App, Button, Form, Input, Modal, Select } from 'antd'
import { useState } from 'react'
import { postJson } from './staff-api'

type Invitation = { acceptUrl: string; expiresAt: string }
type InviteValues = { email: string; role: 'operations' | 'finance' | 'viewer' }

export default function InviteStaff() {
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [form] = Form.useForm<InviteValues>()

  async function create() {
    try {
      const values = await form.validateFields()
      setLoading(true)
      const result = await postJson<Invitation>('/api/auth/invitations', values)
      setInvitation(result)
      message.success('Đã tạo lời mời một lần')
    } catch (reason) {
      if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể tạo lời mời')
    } finally { setLoading(false) }
  }

  return <>
    <Button size="small" onClick={() => setOpen(true)}>Mời nhân viên</Button>
    <Modal title="Mời nhân viên" open={open} onCancel={() => { setOpen(false); setInvitation(null); form.resetFields() }} footer={invitation ? <Button onClick={() => { setOpen(false); setInvitation(null); form.resetFields() }}>Đóng</Button> : <Button type="primary" loading={loading} onClick={() => void create()}>Tạo lời mời</Button>}>
      {invitation ? <><Alert type="warning" showIcon title="Liên kết chỉ dùng một lần" description="Chỉ chia sẻ qua kênh riêng với đúng người nhận. Không lưu liên kết vào tài liệu hoặc kênh công khai." /><Input readOnly value={invitation.acceptUrl} aria-label="Liên kết mời nhân viên" /><Button onClick={() => void navigator.clipboard.writeText(invitation.acceptUrl).then(() => message.success('Đã sao chép'))}>Sao chép</Button></> :
        <Form form={form} layout="vertical" requiredMark={false}><Form.Item name="email" label="Email nhân viên" rules={[{ required: true }, { type: 'email' }]}><Input type="email" autoComplete="off" /></Form.Item><Form.Item name="role" label="Vai trò" rules={[{ required: true }]}><Select options={[{ value: 'operations', label: 'Vận hành' }, { value: 'finance', label: 'Tài chính' }, { value: 'viewer', label: 'Chỉ xem' }]} /></Form.Item></Form>}
    </Modal>
  </>
}
