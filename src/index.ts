import type { WebhookEvents } from 'gitlab-event-types'
import { Context, Schema } from 'koishi'
import {} from '@koishijs/plugin-server'
import {} from 'koishi-plugin-event-server'

type GitlabProjectEvent = Extract<WebhookEvents, { project: any }>

type WebhookEventMap = {
  [E in GitlabProjectEvent['object_kind'] as `gitlab/${E}`]: (payload: Extract<GitlabProjectEvent, { object_kind: E }>) => void
}

declare module 'koishi' {
  interface Events extends WebhookEventMap {}
}

export const name = 'gitlab-webhook'

export const inject = ['server']

export interface Webhook {
  project: string
}

export const Webhook: Schema<Webhook> = Schema.object({
  project: Schema.string().required().description('Project path with namespace (e.g., group/project)'),
})

export interface Config {
  path: string
  webhooks?: Webhook[]
}

export const Config: Schema<Config> = Schema.object({
  path: Schema.string().default('/gitlab/webhook').description('Webhook endpoint path'),
  webhooks: Schema.array(Webhook)
    .default([{ project: '*' }])
    .description('List of webhook configurations'),
})

export function apply(ctx: Context, config: Config) {
  ctx.inject(['eventServer'], (ctx) => {
    ctx.eventServer.register('gitlab/*')
  })

  ctx.server.post(config.path, async (koa) => {
    const payload = koa.request.body as WebhookEvents
    if (!payload) {
      ctx.logger.warn('Failed to parse webhook payload')
      return koa.status = 400
    }

    if (!('project' in payload) || !payload.project) {
      ctx.logger.warn('Webhook payload does not contain project information')
      return koa.status = 400
    }

    // Get project path from payload
    const event = payload.object_kind
    const project = payload.project.path_with_namespace
    ctx.logger.debug('received %s for %s', event, project)

    // Find matching webhook configuration
    const webhook = config.webhooks?.find((webhook) => {
      return webhook.project === '*' || webhook.project === project
    })
    if (!webhook) {
      ctx.logger.warn('No webhook configuration found for project: %s', project)
      return koa.status = 404
    }

    ctx.emit(`gitlab/${event}`, payload as any)

    koa.status = 200
    koa.body = { status: 'ok' }
  })
}
