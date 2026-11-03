'use client'

import { Skeleton } from 'antd'

export default function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-busy="true" aria-live="polite">
      {/* Header Skeleton */}
      <div className="skeleton-header">
        <Skeleton.Input active size="small" style={{ width: 110, height: 14, marginBottom: 10, display: 'block' }} />
        <Skeleton.Input active size="large" style={{ width: 280, height: 32, marginBottom: 12, display: 'block' }} />
        <Skeleton.Input active size="small" style={{ width: 460, height: 16, display: 'block' }} />
      </div>

      {/* KPI / Metric Cards Skeleton */}
      <div className="skeleton-kpis">
        {[1, 2, 3, 4].map(idx => (
          <div key={idx} className="skeleton-card">
            <Skeleton.Input active size="small" style={{ width: 90, height: 13, marginBottom: 12, display: 'block' }} />
            <Skeleton.Input active size="large" style={{ width: 140, height: 28, display: 'block' }} />
          </div>
        ))}
      </div>

      {/* Main Panel & Table Skeleton */}
      <div className="skeleton-panel">
        <div className="skeleton-toolbar">
          <Skeleton.Input active size="default" style={{ width: 200, height: 26 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton.Button active size="default" style={{ width: 120, height: 32 }} />
            <Skeleton.Button active size="default" style={{ width: 90, height: 32 }} />
          </div>
        </div>

        {/* Table Rows Skeleton */}
        <div className="skeleton-table-mock">
          <div className="skeleton-table-header">
            <Skeleton.Input active size="small" style={{ width: '25%', height: 16 }} />
            <Skeleton.Input active size="small" style={{ width: '25%', height: 16 }} />
            <Skeleton.Input active size="small" style={{ width: '25%', height: 16 }} />
            <Skeleton.Input active size="small" style={{ width: '20%', height: 16 }} />
          </div>
          {[1, 2, 3, 4, 5, 6].map(row => (
            <div key={row} className="skeleton-table-row">
              <Skeleton.Input active size="small" style={{ width: `${60 + (row * 7) % 35}%`, height: 15 }} />
              <Skeleton.Input active size="small" style={{ width: `${50 + (row * 11) % 40}%`, height: 15 }} />
              <Skeleton.Input active size="small" style={{ width: `${40 + (row * 13) % 45}%`, height: 15 }} />
              <Skeleton.Button active size="small" style={{ width: 70, height: 24 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
