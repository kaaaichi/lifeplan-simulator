import { Component, type ReactNode } from 'react'

interface Props {
  resetKey: unknown
  children: ReactNode
}
interface State {
  hasError: boolean
}

/** プレビュー計算の保険(§14.4)。resetKey(=ドラフト)が変わったら再試行する。 */
export class PreviewErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return <p role="alert">この設定ではシミュレーションできません</p>
    }
    return this.props.children
  }
}
