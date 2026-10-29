/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ERROR BOUNDARY CHO ỨNG DỤNG ONG NHỎ
 * Bắt lỗi giao diện React và hiển thị màn hình Ong Nhỏ thân thiện có nút "Tải lại trang".
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Bee } from './Bee';
import { RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Lỗi giao diện Ong Nhỏ (ErrorBoundary):', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFFBF0] text-[#2B1B0E] font-['Be_Vietnam_Pro',sans-serif] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border-2 border-[#2B1B0E]/15 shadow-sm text-center space-y-6">
            <div className="flex justify-center">
              <Bee status="buon" size={84} />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 rounded-full bg-[#FDF0F0] text-[#D64545] text-xs font-extrabold uppercase tracking-wider">
                Gặp sự cố giao diện
              </span>
              <h2 className="text-2xl font-black text-[#2B1B0E] tracking-tight">
                Ong Nhỏ gặp chút sự cố
              </h2>
              <p className="text-sm text-[#2B1B0E]/80 leading-relaxed font-medium">
                Đã có lỗi nhỏ xảy ra khi hiển thị trang. Bạn đừng lo, hãy bấm nút "Tải lại" bên dưới để tiếp tục kiểm tra website nhé!
              </p>
            </div>

            {this.state.error?.message && (
              <div className="bg-[#FFFBF0] border border-[#2B1B0E]/10 rounded-xl p-3 text-left">
                <p className="text-xs font-mono text-[#8A4B00] break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[44px] rounded-2xl bg-[#FFB400] hover:bg-[#8A4B00] text-[#2B1B0E] hover:text-white font-extrabold text-sm shadow-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải lại trang</span>
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 px-4 py-3.5 min-h-[44px] rounded-2xl bg-[#FFF3C4] hover:bg-[#FFB400]/40 text-[#8A4B00] font-bold text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Thử lại</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
