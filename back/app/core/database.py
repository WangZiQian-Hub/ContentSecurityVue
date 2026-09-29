import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


# 读取 back/.env
load_dotenv()


MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = os.getenv("MYSQL_PORT", "3306")
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "content_safety")


# MySQL 连接地址
DATABASE_URL = (
    f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
    f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}?charset=utf8mb4"
)


# 创建数据库引擎
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    echo=True,
)


# 每次请求可以从这里创建数据库会话
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    # 工作台聚合接口会在同一事务中推进训练进度并继续序列化已查询的对象。
    expire_on_commit=False,
)


# 所有数据库模型都继承这个基类
class Base(DeclarativeBase):
    pass


def get_db():
    """
    给 FastAPI 路由提供数据库会话。
    使用完后自动关闭。
    """

    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def test_database_connection():
    """
    启动时测试 MySQL 是否能够连接。
    """

    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    print("MySQL 数据库连接成功")
