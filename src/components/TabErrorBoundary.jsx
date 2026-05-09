import React from 'react';
import { AlertCircle } from 'lucide-react';

export class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: typeof error === 'object' ? (error.message || 'Erro Desconhecido') : String(error) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-2xl text-center mt-10 animate-in fade-in">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-red-400 font-black text-xl mb-2">Ops! Erro na Aba</h2>
          <p className="text-sm text-slate-300 mb-4">Ocorreu um erro interno.</p>
          <div className="p-3 bg-black/50 rounded-lg text-xs text-red-300 font-mono text-left overflow-auto mb-6 max-h-32">
            {this.state.errorMsg}
          </div>
          <button onClick={() => window.location.reload()} className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-xl font-bold">Recarregar Página</button>
        </div>
      );
    }
    return this.props.children;
  }
}
