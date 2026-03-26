import { describe, expect, it } from 'vitest'
import { getTableName, getTableColumns } from 'drizzle-orm'
import {
  users,
  domains,
  mailboxes,
  emails,
  threads,
  attachments,
  labels,
  emailLabels,
  contacts,
  apiKeys,
  webhooks,
  webhookLogs,
  templates,
  sendingLogs,
  audiences,
  audienceContacts,
} from './schema/index'

describe('Database Schema', () => {
  describe('users table', () => {
    it('has correct table name', () => {
      expect(getTableName(users)).toBe('users')
    })

    it('has required columns', () => {
      const columns = getTableColumns(users)
      expect(columns).toHaveProperty('id')
      expect(columns).toHaveProperty('email')
      expect(columns).toHaveProperty('name')
      expect(columns).toHaveProperty('passwordHash')
      expect(columns).toHaveProperty('avatarUrl')
      expect(columns).toHaveProperty('createdAt')
      expect(columns).toHaveProperty('updatedAt')
    })
  })

  describe('domains table', () => {
    it('has correct table name', () => {
      expect(getTableName(domains)).toBe('domains')
    })

    it('has DNS verification columns', () => {
      const columns = getTableColumns(domains)
      expect(columns).toHaveProperty('mxVerified')
      expect(columns).toHaveProperty('spfVerified')
      expect(columns).toHaveProperty('dkimVerified')
      expect(columns).toHaveProperty('dmarcVerified')
      expect(columns).toHaveProperty('dkimPublicKey')
      expect(columns).toHaveProperty('dkimPrivateKey')
      expect(columns).toHaveProperty('dkimSelector')
    })
  })

  describe('mailboxes table', () => {
    it('has correct table name', () => {
      expect(getTableName(mailboxes)).toBe('mailboxes')
    })

    it('has quota columns', () => {
      const columns = getTableColumns(mailboxes)
      expect(columns).toHaveProperty('quotaBytes')
      expect(columns).toHaveProperty('usedBytes')
    })
  })

  describe('emails table', () => {
    it('has correct table name', () => {
      expect(getTableName(emails)).toBe('emails')
    })

    it('has all email columns', () => {
      const columns = getTableColumns(emails)
      expect(columns).toHaveProperty('messageId')
      expect(columns).toHaveProperty('fromAddress')
      expect(columns).toHaveProperty('toAddresses')
      expect(columns).toHaveProperty('cc')
      expect(columns).toHaveProperty('bcc')
      expect(columns).toHaveProperty('subject')
      expect(columns).toHaveProperty('textBody')
      expect(columns).toHaveProperty('htmlBody')
      expect(columns).toHaveProperty('folder')
      expect(columns).toHaveProperty('isRead')
      expect(columns).toHaveProperty('isStarred')
      expect(columns).toHaveProperty('isDraft')
      expect(columns).toHaveProperty('threadId')
      expect(columns).toHaveProperty('inReplyTo')
      expect(columns).toHaveProperty('headers')
      expect(columns).toHaveProperty('sizeBytes')
    })
  })

  describe('threads table', () => {
    it('has correct table name', () => {
      expect(getTableName(threads)).toBe('threads')
    })

    it('has participant tracking', () => {
      const columns = getTableColumns(threads)
      expect(columns).toHaveProperty('participantAddresses')
      expect(columns).toHaveProperty('emailCount')
    })
  })

  describe('attachments table', () => {
    it('has correct table name', () => {
      expect(getTableName(attachments)).toBe('attachments')
    })

    it('has storage columns', () => {
      const columns = getTableColumns(attachments)
      expect(columns).toHaveProperty('filename')
      expect(columns).toHaveProperty('contentType')
      expect(columns).toHaveProperty('sizeBytes')
      expect(columns).toHaveProperty('storageKey')
    })
  })

  describe('labels table', () => {
    it('has correct table name', () => {
      expect(getTableName(labels)).toBe('labels')
    })
  })

  describe('emailLabels table', () => {
    it('has correct table name', () => {
      expect(getTableName(emailLabels)).toBe('email_labels')
    })
  })

  describe('contacts table', () => {
    it('has correct table name', () => {
      expect(getTableName(contacts)).toBe('contacts')
    })
  })

  describe('apiKeys table', () => {
    it('has correct table name', () => {
      expect(getTableName(apiKeys)).toBe('api_keys')
    })

    it('has security columns', () => {
      const columns = getTableColumns(apiKeys)
      expect(columns).toHaveProperty('keyHash')
      expect(columns).toHaveProperty('keyPrefix')
      expect(columns).toHaveProperty('scopes')
      expect(columns).toHaveProperty('expiresAt')
    })
  })

  describe('webhooks table', () => {
    it('has correct table name', () => {
      expect(getTableName(webhooks)).toBe('webhooks')
    })
  })

  describe('webhookLogs table', () => {
    it('has correct table name', () => {
      expect(getTableName(webhookLogs)).toBe('webhook_logs')
    })

    it('has tracking columns', () => {
      const columns = getTableColumns(webhookLogs)
      expect(columns).toHaveProperty('event')
      expect(columns).toHaveProperty('payload')
      expect(columns).toHaveProperty('responseStatus')
      expect(columns).toHaveProperty('attempts')
    })
  })

  describe('templates table', () => {
    it('has correct table name', () => {
      expect(getTableName(templates)).toBe('templates')
    })

    it('has template columns', () => {
      const columns = getTableColumns(templates)
      expect(columns).toHaveProperty('name')
      expect(columns).toHaveProperty('subject')
      expect(columns).toHaveProperty('html')
      expect(columns).toHaveProperty('variables')
    })
  })

  describe('sendingLogs table', () => {
    it('has correct table name', () => {
      expect(getTableName(sendingLogs)).toBe('sending_logs')
    })

    it('has tracking columns', () => {
      const columns = getTableColumns(sendingLogs)
      expect(columns).toHaveProperty('status')
      expect(columns).toHaveProperty('openedAt')
      expect(columns).toHaveProperty('clickedAt')
      expect(columns).toHaveProperty('bouncedAt')
      expect(columns).toHaveProperty('deliveredAt')
    })
  })

  describe('audiences table', () => {
    it('has correct table name', () => {
      expect(getTableName(audiences)).toBe('audiences')
    })
  })

  describe('audienceContacts table', () => {
    it('has correct table name', () => {
      expect(getTableName(audienceContacts)).toBe('audience_contacts')
    })

    it('has subscription columns', () => {
      const columns = getTableColumns(audienceContacts)
      expect(columns).toHaveProperty('subscribedAt')
      expect(columns).toHaveProperty('unsubscribedAt')
      expect(columns).toHaveProperty('topics')
    })
  })

  describe('all tables export correctly', () => {
    it('exports all 16 tables', () => {
      const tables = [
        users, domains, mailboxes, emails, threads, attachments,
        labels, emailLabels, contacts, apiKeys, webhooks, webhookLogs,
        templates, sendingLogs, audiences, audienceContacts,
      ]
      expect(tables).toHaveLength(16)
      tables.forEach((table) => {
        expect(getTableName(table)).toBeTruthy()
      })
    })
  })
})
