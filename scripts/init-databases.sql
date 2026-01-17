-- Script de inicialização dos bancos de dados para desenvolvimento
-- Cria o banco central de auditoria + 4 bancos monitorados

USE master;
GO

-- Criar banco central de auditoria (SchemaAudit)
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'SchemaAudit')
BEGIN
    CREATE DATABASE SchemaAudit;
    PRINT 'Banco SchemaAudit (central de auditoria) criado com sucesso!';
END
ELSE
BEGIN
    PRINT 'Banco SchemaAudit já existe.';
END
GO

-- Criar banco TestDB
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'TestDB')
BEGIN
    CREATE DATABASE TestDB;
    PRINT 'Banco TestDB criado com sucesso!';
END
ELSE
BEGIN
    PRINT 'Banco TestDB já existe.';
END
GO

-- Criar banco Test1DB
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'Test1DB')
BEGIN
    CREATE DATABASE Test1DB;
    PRINT 'Banco Test1DB criado com sucesso!';
END
ELSE
BEGIN
    PRINT 'Banco Test1DB já existe.';
END
GO

-- Criar banco Test2DB
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'Test2DB')
BEGIN
    CREATE DATABASE Test2DB;
    PRINT 'Banco Test2DB criado com sucesso!';
END
ELSE
BEGIN
    PRINT 'Banco Test2DB já existe.';
END
GO

-- Criar banco Test3DB
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'Test3DB')
BEGIN
    CREATE DATABASE Test3DB;
    PRINT 'Banco Test3DB criado com sucesso!';
END
ELSE
BEGIN
    PRINT 'Banco Test3DB já existe.';
END
GO

-- Criar tabelas de exemplo em cada banco para testes de DDL
USE TestDB;
GO
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'exemplo_tabela')
BEGIN
    CREATE TABLE exemplo_tabela (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(100),
        criado_em DATETIME DEFAULT GETDATE()
    );
    PRINT 'Tabela exemplo_tabela criada em TestDB';
END
GO

USE Test1DB;
GO
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'exemplo_tabela')
BEGIN
    CREATE TABLE exemplo_tabela (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(100),
        criado_em DATETIME DEFAULT GETDATE()
    );
    PRINT 'Tabela exemplo_tabela criada em Test1DB';
END
GO

USE Test2DB;
GO
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'exemplo_tabela')
BEGIN
    CREATE TABLE exemplo_tabela (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(100),
        criado_em DATETIME DEFAULT GETDATE()
    );
    PRINT 'Tabela exemplo_tabela criada em Test2DB';
END
GO

USE Test3DB;
GO
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'exemplo_tabela')
BEGIN
    CREATE TABLE exemplo_tabela (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(100),
        criado_em DATETIME DEFAULT GETDATE()
    );
    PRINT 'Tabela exemplo_tabela criada em Test3DB';
END
GO

PRINT '========================================';
PRINT 'Todos os bancos foram inicializados!';
PRINT '========================================';
GO
