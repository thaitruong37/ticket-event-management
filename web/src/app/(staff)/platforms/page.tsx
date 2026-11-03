'use client'

import { App, Button, Form, Input, Table } from 'antd'
import { useState } from 'react'
import { postJson, useApi } from '@/components/staff-api'
import type { Platform } from '@/components/staff-types'
import { Loadable, PageHeader } from '@/components/staff-ui'

export default function PlatformsPage() {
  const { message } = App.useApp()
  const { data, loading, error, reload } = useApi<Platform[]>('/api/platforms', [])
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<{ name: string }>()

  const create = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await postJson<Platform>('/api/platforms', { name: values.name.trim() })
      form.resetFields()
      message.success('Đã thêm nền tảng')
      await reload()
    } catch (reason) {
      if (!(reason as { errorFields?: unknown }).errorFields) message.error(reason instanceof Error ? reason.message : 'Không thể tạo nền tảng')
    } finally { setSubmitting(false) }
  }

  return <>
    <PageHeader eyebrow="Nguồn cung" title="Nền tảng bán vé" description="Khai báo các nền tảng nguồn trước khi thêm tài khoản mua vé." />
    <section className="panel create-panel" aria-labelledby="create-platform"><div className="section-heading"><div><span className="eyebrow">Tạo mới</span><h2 id="create-platform">Thêm nền tảng</h2></div></div>
      <Form form={form} layout="inline" requiredMark={false} onFinish={() => void create()}>
        <Form.Item name="name" label="Tên nền tảng" rules={[{ required: true, message: 'Nhập tên nền tảng' }, { max: 120 }]}><Input autoComplete="off" placeholder="Ví dụ: Ticketbox" /></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit" loading={submitting}>Thêm nền tảng</Button></Form.Item>
      </Form>
    </section>
    <Loadable loading={loading} error={error} onRetry={() => void reload()} empty={!data.length} emptyText="Chưa có nền tảng">
      <section className="panel"><Table rowKey={record => record.id} dataSource={data} pagination={{ pageSize: 20, showTotal: total => `${total} nền tảng` }} columns={[
        { title: 'Tên nền tảng', dataIndex: 'name', render: value => <strong>{String(value ?? 'Chưa đặt tên')}</strong> },
        { title: 'Mã nội bộ', dataIndex: 'id', responsive: ['md'], render: value => <span className="mono muted">{String(value)}</span> },
      ]} /></section>
    </Loadable>
  </>
}
