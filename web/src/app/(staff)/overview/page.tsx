'use client'

import { Alert, Button, List } from 'antd'
import Link from 'next/link'
import { useApi } from '@/components/staff-api'
import { Loadable, PageHeader } from '@/components/staff-ui'

interface Overview {
  inventory?: { ready?: number; preparing?: number }
  orders?: { awaiting?: number; review?: number }
  delivery?: number
  cases?: number
}

export default function OverviewPage() {
  const overview = useApi<Overview>('/api/overview', {})
  const tasks = [
    { key: 'preparing', title: 'Vé đang chuẩn bị', description: 'Cần đủ điều kiện nguồn mua, khả năng chuyển và bằng chứng xác minh.', count: overview.data.inventory?.preparing ?? 0, href: '/inventory' },
    { key: 'awaiting', title: 'Đơn chờ thanh toán', description: 'Theo dõi trạng thái máy chủ; không dựa vào trang quay lại.', count: overview.data.orders?.awaiting ?? 0, href: '/orders' },
    { key: 'review', title: 'Đơn cần đối soát', description: 'Kiểm tra giao dịch hoặc chênh lệch trước khi xử lý tiếp.', count: overview.data.orders?.review ?? 0, href: '/finance' },
    { key: 'delivery', title: 'Lượt giao đang chờ', description: 'Giao vé với người nhận và tham chiếu bằng chứng.', count: overview.data.delivery ?? 0, href: '/orders' },
    { key: 'cases', title: 'Hồ sơ đang mở', description: 'Các tình huống cần nhân viên xem xét thủ công.', count: overview.data.cases ?? 0, href: '/finance' },
  ]

  return <>
    <PageHeader eyebrow="Trung tâm vận hành" title="Tổng quan công việc" description="Danh sách ưu tiên cho ca làm việc hiện tại, được tổng hợp trực tiếp từ dữ liệu máy chủ." />
    <Alert className="page-alert" type="success" showIcon title={`${overview.data.inventory?.ready ?? 0} vé đang sẵn sàng bán`} description="Chỉ vé đã vượt qua đầy đủ kiểm tra nghiệp vụ mới xuất hiện ở trạng thái sẵn sàng." />
    <Loadable loading={overview.loading} error={overview.error} onRetry={() => void overview.reload()}>
      <section className="panel task-panel" aria-labelledby="task-heading"><div className="section-heading"><div><span className="eyebrow">Ưu tiên</span><h2 id="task-heading">Việc cần chú ý</h2></div><Button onClick={() => void overview.reload()}>Làm mới</Button></div>
        <List dataSource={tasks} renderItem={item => <List.Item actions={[<Link key="open" href={item.href}>Mở danh sách</Link>]}><List.Item.Meta title={<span>{item.title} <strong className="count-badge">{item.count}</strong></span>} description={item.description} /></List.Item>} />
      </section>
      <div className="two-column">
        <section className="panel"><span className="eyebrow">Quy trình</span><h2>Nhập và xác minh tồn kho</h2><ol className="process-list"><li>Khai báo nền tảng và tài khoản nguồn.</li><li>Tạo sự kiện, suất diễn và hạng vé.</li><li>Ghi nhận lần mua rồi nhập vé.</li><li>Xác minh khả năng chuyển bằng tham chiếu bằng chứng.</li></ol><Link href="/purchases">Bắt đầu nhập nguồn</Link></section>
        <section className="panel"><span className="eyebrow">Kiểm soát</span><h2>Thanh toán và giao vé</h2><ol className="process-list"><li>Tạo đơn chỉ từ vé sẵn sàng.</li><li>Phát hành liên kết thanh toán.</li><li>Chờ webhook hoặc đối soát xác minh.</li><li>Ghi nhận giao vé với người nhận và bằng chứng.</li></ol><Link href="/orders">Mở đơn hàng</Link></section>
      </div>
    </Loadable>
  </>
}
