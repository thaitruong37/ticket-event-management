'use client'

import { Alert, Button, Empty, Skeleton, Tag } from 'antd'
import type { ReactNode } from 'react'

export const money = (value: unknown) => typeof value === 'number'
  ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
  : '—'

export const dateTime = (value: unknown) => {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

const statusLabels: Record<string, string> = {
  active: 'Đang hoạt động', available: 'Sẵn sàng', pending: 'Đang chờ', preparing: 'Đang chuẩn bị', held: 'Đang giữ', draft: 'Bản nháp', archived: 'Đã lưu trữ',
  allocated: 'Đã phân bổ', sold: 'Đã bán', blocked: 'Đã chặn', void: 'Vô hiệu', verified: 'Đã xác minh', unverified: 'Chưa xác minh', not_transferable: 'Không thể chuyển', confirmed: 'Đã xác nhận', refunded: 'Đã hoàn',
  paid: 'Đã xác nhận thanh toán', unpaid: 'Chưa thanh toán', review: 'Cần đối soát',
  delivered: 'Đã giao', fulfilled: 'Đã hoàn tất', awaiting_payment: 'Chờ thanh toán', payment_review: 'Cần đối soát', in_progress: 'Đang xử lý', processing: 'Đang xử lý', failed: 'Thất bại', error: 'Có lỗi', cancelled: 'Đã hủy',
  canceled: 'Đã hủy', expired: 'Hết hạn', completed: 'Hoàn tất', open: 'Đang mở', closed: 'Đã đóng',
}

export function StatusTag({ value }: { value: unknown }) {
  const status = typeof value === 'string' && value ? value : 'pending'
  const color = ['paid', 'delivered', 'fulfilled', 'confirmed', 'verified', 'available', 'active', 'completed'].includes(status) ? 'green'
    : ['error', 'failed', 'cancelled', 'canceled', 'blocked', 'void', 'expired', 'not_transferable'].includes(status) ? 'red'
      : ['review', 'payment_review', 'awaiting_payment', 'held', 'processing', 'in_progress'].includes(status) ? 'gold' : 'default'
  return <Tag color={color}>{statusLabels[status] ?? status}</Tag>
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>
}

export function Loadable({ loading, error, onRetry, children, empty, emptyText = 'Chưa có dữ liệu' }: { loading: boolean; error: string | null; onRetry: () => void; children: ReactNode; empty?: boolean; emptyText?: string }) {
  if (loading) return <section className="panel" aria-live="polite"><Skeleton active paragraph={{ rows: 6 }} /></section>
  if (error) return <Alert type="error" showIcon title="Không thể tải dữ liệu" description={error} action={<Button onClick={onRetry}>Thử lại</Button>} />
  if (empty) return <section className="panel"><Empty description={emptyText} /></section>
  return <>{children}</>
}

export function EntityName({ value, fallback = 'Chưa đặt tên' }: { value: unknown; fallback?: string }) {
  return <>{typeof value === 'string' && value.trim() ? value : fallback}</>
}

export const idOf = (value: unknown) => typeof value === 'string' ? value : ''
