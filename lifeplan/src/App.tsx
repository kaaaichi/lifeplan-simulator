import { useEffect, useMemo } from 'react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { AuthGate } from './components/auth/AuthGate'
import { Header } from './components/layout/Header'
import { Dashboard } from './components/dashboard/Dashboard'
import { InputPage } from './components/input/InputPage'
import { ScenariosPage } from './components/scenarios/ScenariosPage'
import { ActualsPage } from './components/actuals/ActualsPage'
import { useHouseholdStore } from './store/householdStore'
import { selectDashboardData } from './store/selectors'

function Layout() {
  const load = useHouseholdStore((s) => s.load)
  const repository = useHouseholdStore((s) => s.repository)
  useEffect(() => {
    void load(repository)
  }, [load, repository])
  return (
    <>
      <Header />
      <Outlet />
    </>
  )
}

function DashboardRoute() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const data = useMemo(() => (doc ? selectDashboardData(doc) : null), [doc])
  return (
    <>
      {status === 'error' && <p role="alert">データの読み込みに失敗しました</p>}
      {status !== 'error' && !data && <p>読み込み中...</p>}
      {data && doc && <Dashboard data={data} baseline={doc.baseline ?? null} actuals={doc.actuals} />}
    </>
  )
}

const routes = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardRoute /> },
      { path: '/input', element: <InputPage /> },
      { path: '/input/:scenarioId', element: <InputPage /> },
      { path: '/scenarios', element: <ScenariosPage /> },
      { path: '/actuals', element: <ActualsPage /> },
    ],
  },
]

export function App() {
  const router = useMemo(() => createBrowserRouter(routes), [])
  return (
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>
  )
}
