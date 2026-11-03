'use client'

import { App, Button, Form, Input, Select, Table } from 'antd'
import { useState } from 'react'
import { postJson, useApi } from '@/components/staff-api'
import type { Account, Platform } from '@/components/staff-types'
import { Loadable, PageHeader } from '@/components/staff-ui'

interface Values { platformId: string; label: string; accountReference: string }

export default function AccountsPage() {
  const { message } = App.useApp()
  const accounts = useApi<Account[]>('/api/accounts', [])
  const platforms = useApi<Platform[]>('/api/platforms', [])
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<Values>()
  const platformName = (id: unknown) => platforms.data.find(item => item.id === id)?.name ?? 'Không xác định'

  const create = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await postJson<Account>('/api/accounts', { ...values, label: values.label.trim(), accountReference: values.accountReference.trim() })
      form.resetFields()
      message.success('Đã thêm tài khoản nguồn')
      await accounts.reload()
    } catch (reason) {
      if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể tạo tài khoản')
    } finally { setSubmitting(false) }
  }

  return <>
    <PageHeader eyebrow="Nguồn cung" title="Tài khoản nền tảng" description="Theo dõi tài khoản dùng để ghi nhận nguồn mua. Không nhập mật khẩu, OTP hoặc thông tin đăng nhập." />
    <section className="panel create-panel"><div className="section-heading"><div><span className="eyebrow">Tạo mới</span><h2>Thêm tài khoản</h2></div></div>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={() => void create()}>
        <div className="form-grid three">
          <Form.Item name="platformId" label="Nền tảng" rules={[{ required: true, message: 'Chọn nền tảng' }]}><Select showSearch optionFilterProp="label" placeholder="Chọn nền tảng" options={platforms.data.map(item => ({ value: item.id, label: item.name ?? item.id }))} /></Form.Item>
          <Form.Item name="label" label="Tên gợi nhớ" rules={[{ required: true, message: 'Nhập tên gợi nhớ' }]}><Input autoComplete="off" placeholder="Tài khoản chính" /></Form.Item>
          <Form.Item name="accountReference" label="Tham chiếu tài khoản" rules={[{ required: true, message: 'Nhập tham chiếu tài khoản' }]}><Input autoComplete="off" placeholder="Email hoặc mã tài khoản nguồn" /></Form.Item>
        </div>
        <Button type="primary" htmlType="submit" loading={submitting} disabled={!platforms.data.length}>Thêm tài khoản</Button>
      </Form>
    </section>
    <Loadable loading={accounts.loading || platforms.loading} error={accounts.error || platforms.error} onRetry={() => { void accounts.reload(); void platforms.reload() }} empty={!accounts.data.length} emptyText="Chưa có tài khoản">
      <section className="panel"><Table rowKey={record => record.id} dataSource={accounts.data} scroll={{ x: 720 }} columns={[
        { title: 'Tài khoản', dataIndex: 'label', render: (value, row) => <div><strong>{String(value ?? 'Chưa đặt tên')}</strong><div className="table-subtext">{row.accountReference ?? row.email ?? 'Chưa có tham chiếu'}</div></div> },
        { title: 'Nền tảng', dataIndex: 'platformId', render: platformName },
        { title: 'Mã nội bộ', dataIndex: 'id', responsive: ['lg'], render: value => <span className="mono muted">{String(value)}</span> },
      ]} /></section>
    </Loadable>
  </>
}
