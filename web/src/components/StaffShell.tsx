'use client'

import { App, Avatar, Button, ConfigProvider, Drawer, Layout, Menu, theme } from 'antd'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useTransition, type ReactNode } from 'react'
import DashboardSkeleton from './DashboardSkeleton'
import InviteStaff from './InviteStaff'

type StaffRole = 'owner' | 'operations' | 'finance' | 'viewer'

const items = [
  { key: '/overview', label: 'Tổng quan', symbol: '⌂' },
  { key: '/platforms', label: 'Nền tảng', symbol: '◇' },
  { key: '/accounts', label: 'Tài khoản', symbol: '◎' },
  { key: '/events', label: 'Sự kiện', symbol: '□' },
  { key: '/purchases', label: 'Lần mua', symbol: '↓' },
  { key: '/inventory', label: 'Kho vé', symbol: '▤' },
  { key: '/orders', label: 'Đơn hàng', symbol: '▣' },
  { key: '/finance', label: 'Tài chính', symbol: '₫' },
]

function Navigation({
  close,
  role,
  activeKey,
  onSelect,
}: {
  close?: () => void
  role: StaffRole
  activeKey: string
  onSelect: (key: string) => void
}) {
  const router = useRouter()

  useEffect(() => {
    // Prefetch all staff tabs in background for rapid navigation
    for (const item of items) {
      router.prefetch(item.key)
    }
  }, [router])

  return (
    <div className="sider-inner">
      <Link
        href="/overview"
        className="brand"
        onClick={() => {
          close?.()
          onSelect('/overview')
        }}
      >
        <span className="brand-mark" aria-hidden="true">T</span>
        <span>TicketOps</span>
      </Link>
      <div className="workspace-card">
        <span className="workspace-avatar">NV</span>
        <div>
          <strong>Vận hành vé</strong>
          <small>Khu vực nhân viên</small>
        </div>
      </div>
      <span className="nav-caption">ĐIỀU HƯỚNG</span>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[activeKey]}
        onClick={({ key }) => {
          close?.()
          onSelect(key)
        }}
        items={items
          .filter(item => item.key !== '/finance' || role === 'owner' || role === 'finance')
          .map(item => ({
            key: item.key,
            icon: <span className="nav-symbol" aria-hidden="true">{item.symbol}</span>,
            label: item.label,
          }))}
      />
      <div className="sider-footer">
        <span className="health-dot" /> Phiên nhân viên đang hoạt động
        <small>Dữ liệu được tải trực tiếp từ hệ thống.</small>
      </div>
    </div>
  )
}

export default function StaffShell({
  children,
  role,
  displayName,
}: {
  children: ReactNode
  role: StaffRole
  displayName: string
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [target, setTarget] = useState<{ path: string; key: string } | null>(null)

  const isNavigating = isPending && target !== null && target.path !== pathname
  const activeKey = isNavigating
    ? target.key
    : items.find(item => pathname.startsWith(item.key))?.key ?? '/overview'

  const handleSelect = (key: string) => {
    if (key !== pathname) {
      setTarget({ path: key, key })
      startTransition(() => {
        router.push(key)
      })
    }
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1f6653',
          colorInfo: '#1f6653',
          borderRadius: 9,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
        components: {
          Layout: {
            siderBg: '#123d34',
            headerBg: '#ffffff',
            bodyBg: '#f4f6f3',
          },
          Menu: {
            darkItemBg: '#123d34',
            darkItemSelectedBg: '#28584d',
            darkItemColor: '#bed0c9',
            darkItemSelectedColor: '#ffffff',
          },
        },
      }}
    >
      <App>
        {isNavigating && <div className="top-progress-bar" />}
        <Layout className="staff-layout">
          <a className="skip-link" href="#main-content">
            Đến nội dung chính
          </a>
          <Layout.Sider width={248} className="desktop-sider">
            <Navigation role={role} activeKey={activeKey} onSelect={handleSelect} />
          </Layout.Sider>
          <Drawer
            className="mobile-drawer"
            placement="left"
            width={272}
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            styles={{ body: { padding: 0, background: '#123d34' } }}
            title="Điều hướng"
          >
            <Navigation
              role={role}
              close={() => setMobileOpen(false)}
              activeKey={activeKey}
              onSelect={handleSelect}
            />
          </Drawer>
          <Layout className="main-layout">
            <Layout.Header className="topbar">
              <Button
                className="mobile-menu"
                type="text"
                aria-label="Mở điều hướng"
                onClick={() => setMobileOpen(true)}
              >
                ☰
              </Button>
              <div className="topbar-title">
                <strong>Trung tâm vận hành</strong>
                <small>Quản lý nguồn vé, đơn hàng và đối soát</small>
              </div>
              <div className="staff-identity">
                <Avatar size={34}>{displayName.slice(0, 1).toUpperCase()}</Avatar>
                <span>
                  <strong>{displayName}</strong>
                  <small>{role}</small>
                </span>
                {role === 'owner' && <InviteStaff />}
                <form action="/api/auth/logout" method="post">
                  <Button htmlType="submit" size="small">
                    Đăng xuất
                  </Button>
                </form>
              </div>
            </Layout.Header>
            <Layout.Content id="main-content" className="staff-content">
              {isNavigating ? <DashboardSkeleton /> : children}
              <footer className="content-footer">
                <span>TicketOps · Giao diện vận hành nội bộ</span>
                <span>Không hiển thị mã vé hoặc thông tin xác thực</span>
              </footer>
            </Layout.Content>
          </Layout>
        </Layout>
      </App>
    </ConfigProvider>
  )
}
