import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import Providers from '@/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'TicketOps',
  description: 'Vận hành nguồn vé, kho, đơn và thanh toán',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  )
}
