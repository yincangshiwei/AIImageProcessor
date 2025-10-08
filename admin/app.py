import gradio as gr
import sqlite3
import pandas as pd
from datetime import datetime, timedelta
import json
import os
import uuid
import hashlib
from typing import List, Dict, Any, Optional, Tuple
import base64
from PIL import Image
import io
from config import DATABASE_PATH

# 数据库初始化
def init_database():
    """初始化数据库"""
    conn = sqlite3.connect(str(DATABASE_PATH))
    cursor = conn.cursor()
    
    # 授权码表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS auth_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            credits INTEGER DEFAULT 100,
            expire_date TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 积分调整记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS credit_adjustments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auth_code TEXT NOT NULL,
            adjustment_type TEXT NOT NULL,
            amount INTEGER NOT NULL,
            reason TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (auth_code) REFERENCES auth_codes (code)
        )
    ''')
    
    # 生成记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS generation_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auth_code TEXT NOT NULL,
            mode TEXT NOT NULL,
            prompt TEXT,
            images_data TEXT,
            output_count INTEGER DEFAULT 1,
            generated_images TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (auth_code) REFERENCES auth_codes (code)
        )
    ''')
    
    # 案例表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            prompt TEXT NOT NULL,
            mode TEXT NOT NULL,
            canvas_size TEXT,
            sample_images TEXT,
            tags TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

# 授权码管理功能
class AuthCodeManager:
    @staticmethod
    def generate_auth_code() -> str:
        """生成授权码"""
        return str(uuid.uuid4()).replace('-', '').upper()[:16]
    
    @staticmethod
    def add_auth_code(credits: int, expire_days: int) -> Tuple[str, str]:
        """添加授权码"""
        try:
            conn = sqlite3.connect(str(DATABASE_PATH))
            cursor = conn.cursor()
            
            code = AuthCodeManager.generate_auth_code()
            expire_date = (datetime.now() + timedelta(days=expire_days)).strftime('%Y-%m-%d %H:%M:%S')
            
            cursor.execute('''
                INSERT INTO auth_codes (code, credits, expire_date)
                VALUES (?, ?, ?)
            ''', (code, credits, expire_date))
            
            conn.commit()
            conn.close()
            
            return "success", f"授权码创建成功: {code}"
        except Exception as e:
            return "error", f"创建失败: {str(e)}"
    
    @staticmethod
    def get_auth_codes() -> pd.DataFrame:
        """获取授权码列表"""
        conn = sqlite3.connect(str(DATABASE_PATH))
        df = pd.read_sql_query('''
            SELECT code as 授权码, credits as 积分, expire_date as 过期时间, 
                   status as 状态, created_at as 创建时间
            FROM auth_codes 
            ORDER BY created_at DESC
        ''', conn)
        conn.close()
        return df
    
    @staticmethod
    def update_auth_code(code: str, credits: int, expire_date: str, status: str) -> Tuple[str, str]:
        """更新授权码"""
        try:
            conn = sqlite3.connect(str(DATABASE_PATH))
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE auth_codes 
                SET credits = ?, expire_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE code = ?
            ''', (credits, expire_date, status, code))
            
            if cursor.rowcount == 0:
                conn.close()
                return "error", "授权码不存在"
            
            conn.commit()
            conn.close()
            
            return "success", "授权码更新成功"
        except Exception as e:
            return "error", f"更新失败: {str(e)}"
    
    @staticmethod
    def delete_auth_code(code: str) -> Tuple[str, str]:
        """删除授权码"""
        try:
            conn = sqlite3.connect(str(DATABASE_PATH))
            cursor = conn.cursor()
            
            cursor.execute('DELETE FROM auth_codes WHERE code = ?', (code,))
            
            if cursor.rowcount == 0:
                conn.close()
                return "error", "授权码不存在"
            
            conn.commit()
            conn.close()
            
            return "success", "授权码删除成功"
        except Exception as e:
            return "error", f"删除失败: {str(e)}"
    
    @staticmethod
    def adjust_credits(code: str, adjustment_type: str, amount: int, reason: str) -> Tuple[str, str]:
        """调整积分"""
        try:
            conn = sqlite3.connect(str(DATABASE_PATH))
            cursor = conn.cursor()
            
            # 获取当前积分
            cursor.execute('SELECT credits FROM auth_codes WHERE code = ?', (code,))
            result = cursor.fetchone()
            if not result:
                conn.close()
                return "error", "授权码不存在"
            
            current_credits = result[0]
            
            # 计算新积分
            if adjustment_type == "增加":
                new_credits = current_credits + amount
            else:  # 减少
                new_credits = max(0, current_credits - amount)
            
            # 更新积分
            cursor.execute('''
                UPDATE auth_codes SET credits = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE code = ?
            ''', (new_credits, code))
            
            # 记录调整历史
            cursor.execute('''
                INSERT INTO credit_adjustments (auth_code, adjustment_type, amount, reason)
                VALUES (?, ?, ?, ?)
            ''', (code, adjustment_type, amount, reason))
            
            conn.commit()
            conn.close()
            
            return "success", f"积分调整成功，当前积分: {new_credits}"
        except Exception as e:
            return "error", f"调整失败: {str(e)}"

# 生成记录管理
class GenerationRecordManager:
    @staticmethod
    def get_generation_records() -> pd.DataFrame:
        """获取生成记录"""
        conn = sqlite3.connect(str(DATABASE_PATH))
        df = pd.read_sql_query('''
            SELECT auth_code as 授权码, mode as 模式, prompt as 提示词,
                   output_count as 输出数量, created_at as 生成时间
            FROM generation_records 
            ORDER BY created_at DESC
        ''', conn)
        conn.close()
        return df
    
    @staticmethod
    def get_record_detail(record_id: int) -> Dict:
        """获取记录详情"""
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM generation_records WHERE id = ?
        ''', (record_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            columns = [description[0] for description in cursor.description]
            return dict(zip(columns, result))
        return {}

# 案例管理
class CaseManager:
    @staticmethod
    def add_case(title: str, category: str, description: str, prompt: str, 
                mode: str, canvas_size: str, tags: str) -> Tuple[str, str]:
        """添加案例"""
        try:
            conn = sqlite3.connect(str(DATABASE_PATH))
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO cases (title, category, description, prompt, mode, canvas_size, tags)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (title, category, description, prompt, mode, canvas_size, tags))
            
            conn.commit()
            conn.close()
            
            return "success", "案例添加成功"
        except Exception as e:
            return "error", f"添加失败: {str(e)}"
    
    @staticmethod
    def get_cases() -> pd.DataFrame:
        """获取案例列表"""
        conn = sqlite3.connect(str(DATABASE_PATH))
        df = pd.read_sql_query('''
            SELECT id, title as 标题, category as 分类, description as 描述,
                   mode as 模式, status as 状态, created_at as 创建时间
            FROM cases 
            ORDER BY created_at DESC
        ''', conn)
        conn.close()
        return df
    
    @staticmethod
    def update_case(case_id: int, title: str, category: str, description: str, 
                   prompt: str, mode: str, canvas_size: str, tags: str, status: str) -> Tuple[str, str]:
        """更新案例"""
        try:
            conn = sqlite3.connect(str(DATABASE_PATH))
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE cases 
                SET title = ?, category = ?, description = ?, prompt = ?, 
                    mode = ?, canvas_size = ?, tags = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (title, category, description, prompt, mode, canvas_size, tags, status, case_id))
            
            if cursor.rowcount == 0:
                conn.close()
                return "error", "案例不存在"
            
            conn.commit()
            conn.close()
            
            return "success", "案例更新成功"
        except Exception as e:
            return "error", f"更新失败: {str(e)}"
    
    @staticmethod
    def delete_case(case_id: int) -> Tuple[str, str]:
        """删除案例"""
        try:
            conn = sqlite3.connect(str(DATABASE_PATH))
            cursor = conn.cursor()
            
            cursor.execute('DELETE FROM cases WHERE id = ?', (case_id,))
            
            if cursor.rowcount == 0:
                conn.close()
                return "error", "案例不存在"
            
            conn.commit()
            conn.close()
            
            return "success", "案例删除成功"
        except Exception as e:
            return "error", f"删除失败: {str(e)}"

# 创建Gradio界面
def create_admin_interface():
    """创建管理界面"""
    
    # 初始化数据库
    init_database()
    
    with gr.Blocks(title="AI图像编辑平台 - 后台管理", theme=gr.themes.Soft()) as app:
        gr.Markdown("# 🎨 AI图像编辑平台 - 后台管理系统")
        
        with gr.Tabs():
            # 授权码管理
            with gr.TabItem("🔑 授权码管理"):
                with gr.Row():
                    with gr.Column(scale=1):
                        gr.Markdown("### 添加新授权码")
                        credits_input = gr.Number(label="初始积分", value=100, minimum=0)
                        expire_days_input = gr.Number(label="有效期(天)", value=30, minimum=1)
                        add_btn = gr.Button("生成授权码", variant="primary")
                        add_result = gr.Textbox(label="操作结果", interactive=False)
                        
                        gr.Markdown("### 积分调整")
                        adjust_code = gr.Textbox(label="授权码")
                        adjust_type = gr.Radio(["增加", "减少"], label="调整类型", value="增加")
                        adjust_amount = gr.Number(label="调整数量", value=10, minimum=1)
                        adjust_reason = gr.Textbox(label="调整原因")
                        adjust_btn = gr.Button("调整积分", variant="secondary")
                        adjust_result = gr.Textbox(label="调整结果", interactive=False)
                    
                    with gr.Column(scale=2):
                        gr.Markdown("### 授权码列表")
                        refresh_auth_btn = gr.Button("刷新列表")
                        auth_codes_df = gr.Dataframe(
                            headers=["授权码", "积分", "过期时间", "状态", "创建时间"],
                            interactive=False
                        )
                        
                        with gr.Row():
                            update_code = gr.Textbox(label="要更新的授权码")
                            update_credits = gr.Number(label="新积分", value=100)
                            update_expire = gr.Textbox(label="新过期时间 (YYYY-MM-DD HH:MM:SS)")
                            update_status = gr.Radio(["active", "disabled"], label="状态", value="active")
                        
                        with gr.Row():
                            update_btn = gr.Button("更新授权码", variant="secondary")
                            delete_code = gr.Textbox(label="要删除的授权码")
                            delete_btn = gr.Button("删除授权码", variant="stop")
                        
                        update_result = gr.Textbox(label="操作结果", interactive=False)
                
                # 事件绑定
                add_btn.click(
                    AuthCodeManager.add_auth_code,
                    inputs=[credits_input, expire_days_input],
                    outputs=[gr.State(), add_result]
                )
                
                adjust_btn.click(
                    AuthCodeManager.adjust_credits,
                    inputs=[adjust_code, adjust_type, adjust_amount, adjust_reason],
                    outputs=[gr.State(), adjust_result]
                )
                
                refresh_auth_btn.click(
                    AuthCodeManager.get_auth_codes,
                    outputs=auth_codes_df
                )
                
                update_btn.click(
                    AuthCodeManager.update_auth_code,
                    inputs=[update_code, update_credits, update_expire, update_status],
                    outputs=[gr.State(), update_result]
                )
                
                delete_btn.click(
                    AuthCodeManager.delete_auth_code,
                    inputs=delete_code,
                    outputs=[gr.State(), update_result]
                )
            
            # 生成记录
            with gr.TabItem("📊 生成记录"):
                gr.Markdown("### 用户生成记录")
                refresh_records_btn = gr.Button("刷新记录")
                records_df = gr.Dataframe(
                    headers=["授权码", "模式", "提示词", "输出数量", "生成时间"],
                    interactive=False
                )
                
                refresh_records_btn.click(
                    GenerationRecordManager.get_generation_records,
                    outputs=records_df
                )
            
            # 案例管理
            with gr.TabItem("📚 案例管理"):
                with gr.Row():
                    with gr.Column(scale=1):
                        gr.Markdown("### 添加新案例")
                        case_title = gr.Textbox(label="案例标题")
                        case_category = gr.Dropdown(
                            choices=["人物", "风景", "动物", "建筑", "艺术", "其他"],
                            label="案例分类"
                        )
                        case_description = gr.Textbox(label="案例描述", lines=3)
                        case_prompt = gr.Textbox(label="提示词", lines=4)
                        case_mode = gr.Radio(["拼图模式", "多图模式"], label="模式", value="拼图模式")
                        case_canvas_size = gr.Textbox(label="画布尺寸", value="1024x1024")
                        case_tags = gr.Textbox(label="标签 (用逗号分隔)")
                        add_case_btn = gr.Button("添加案例", variant="primary")
                        add_case_result = gr.Textbox(label="操作结果", interactive=False)
                    
                    with gr.Column(scale=2):
                        gr.Markdown("### 案例列表")
                        refresh_cases_btn = gr.Button("刷新列表")
                        cases_df = gr.Dataframe(
                            headers=["ID", "标题", "分类", "描述", "模式", "状态", "创建时间"],
                            interactive=False
                        )
                        
                        gr.Markdown("### 编辑案例")
                        with gr.Row():
                            edit_case_id = gr.Number(label="案例ID", precision=0)
                            edit_case_title = gr.Textbox(label="标题")
                            edit_case_category = gr.Dropdown(
                                choices=["人物", "风景", "动物", "建筑", "艺术", "其他"],
                                label="分类"
                            )
                        
                        edit_case_description = gr.Textbox(label="描述", lines=2)
                        edit_case_prompt = gr.Textbox(label="提示词", lines=3)
                        
                        with gr.Row():
                            edit_case_mode = gr.Radio(["拼图模式", "多图模式"], label="模式")
                            edit_case_canvas_size = gr.Textbox(label="画布尺寸")
                            edit_case_tags = gr.Textbox(label="标签")
                            edit_case_status = gr.Radio(["active", "disabled"], label="状态")
                        
                        with gr.Row():
                            update_case_btn = gr.Button("更新案例", variant="secondary")
                            delete_case_id = gr.Number(label="要删除的案例ID", precision=0)
                            delete_case_btn = gr.Button("删除案例", variant="stop")
                        
                        case_operation_result = gr.Textbox(label="操作结果", interactive=False)
                
                # 案例管理事件绑定
                add_case_btn.click(
                    CaseManager.add_case,
                    inputs=[case_title, case_category, case_description, case_prompt, 
                           case_mode, case_canvas_size, case_tags],
                    outputs=[gr.State(), add_case_result]
                )
                
                refresh_cases_btn.click(
                    CaseManager.get_cases,
                    outputs=cases_df
                )
                
                update_case_btn.click(
                    CaseManager.update_case,
                    inputs=[edit_case_id, edit_case_title, edit_case_category, edit_case_description,
                           edit_case_prompt, edit_case_mode, edit_case_canvas_size, edit_case_tags, edit_case_status],
                    outputs=[gr.State(), case_operation_result]
                )
                
                delete_case_btn.click(
                    CaseManager.delete_case,
                    inputs=delete_case_id,
                    outputs=[gr.State(), case_operation_result]
                )
        
        # 页面加载时自动刷新数据
        app.load(
            lambda: [AuthCodeManager.get_auth_codes(), GenerationRecordManager.get_generation_records(), CaseManager.get_cases()],
            outputs=[auth_codes_df, records_df, cases_df]
        )
    
    return app

if __name__ == "__main__":
    app = create_admin_interface()
    app.launch(
        server_name="0.0.0.0",
        server_port=7860,
        share=False,
        debug=True
    )