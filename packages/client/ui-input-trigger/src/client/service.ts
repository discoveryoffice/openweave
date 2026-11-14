/**
 * InputTriggerService (`ctx.inputTriggers`): the root half of the trigger pipeline — the
 * stateless source registry plus the per-session controller map. Every piece
 * of mutable interaction state (hit, menu, fetch) lives on the
 * {@link InputTriggerController}; the service only registers sources, resolves
 * controllers by session scope, and relays roster changes.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions, SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import { WeakMapWithValues } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientSessionContext, InputTriggerFilter, InputTriggerSource } from '../types.ts'
import { InputTriggerController } from './controller.ts'
import type { InputTriggerServiceContract } from './contract.ts'

/**
 * All mutable service state in one holder: cordis service methods run behind
 * the caller-ctx tracker, so mutation goes through one property read — never
 * field assignment on `this`.
 */
interface LiveState {
  /** Registration order = menu group order = matchSpace/matchEnter poll order. */
  readonly sources: InputTriggerSource[]
  /** Session-scoped visibility rules; every answer must be true for a source to join a roster. */
  readonly filters: InputTriggerFilter[]
  /** Per-session controllers; entries are deleted by their scope disposer. */
  readonly controllers: WeakMapWithValues<SessionBinding, InputTriggerController>
}

/** The `ctx.inputTriggers` trigger pipeline service (root registry + controller resolution). */
export class InputTriggerService extends Service implements InputTriggerServiceContract {
  static inject = ['sessions']

  private readonly live: LiveState = {
    sources: [], filters: [], controllers: new WeakMapWithValues(),
  }

  /**
   * @param ctx - owning root context (the service registers itself as `slash`).
   */
  constructor(ctx: Context) {
    super(ctx, 'inputTriggers')
    ctx.on('locale/change', () => {
      for (const controller of this.live.controllers.values) controller.refreshOpenMenu()
    })
  }

  /**
   * Register one trigger source. Live session controllers are notified so a
   * source arriving after scope birth still warms and joins the lexicon.
   * @param src - the source; (trigger, name) must be unique — duplicates throw.
   * @returns the disposer (callers wrap registration in ctx.effect). Disposal
   * while a controller shows the source's menu group drops that group.
   */
  registerSource(src: InputTriggerSource): () => void {
    const { live } = this
    if (live.sources.some(s => s.trigger === src.trigger && s.name === src.name)) {
      throw new Error(`slash source "${src.trigger}${src.name}" is already registered`)
    }
    live.sources.push(src)
    for (const controller of live.controllers.values) {
      try {
        controller.sourceAdded(src)
      } catch (error) {
        // Contain faulty source callbacks (warm/subscribeLexicon): the
        // registration must stand with a usable disposer and the remaining
        // controllers must still be notified.
        console.error(`[ui-input-trigger] source "${src.trigger}${src.name}" late-registration setup failed:`, error)
      }
    }
    return () => {
      const at = live.sources.indexOf(src)
      if (at < 0) return
      live.sources.splice(at, 1)
      for (const controller of live.controllers.values) controller.sourceRemoved(src)
    }
  }

  /**
   * Register a session-scoped visibility rule over all trigger sources. Live
   * session menus rebuild their groups so a hidden source disappears at once.
   * @param filter - rule evaluated on every roster read for one session.
   * @returns disposer (callers wrap registration in ctx.effect).
   */
  registerFilter(filter: InputTriggerFilter): () => void {
    const { live } = this
    live.filters.push(filter)
    this.refreshRosters()
    return () => {
      const at = live.filters.indexOf(filter)
      if (at < 0) return
      live.filters.splice(at, 1)
      this.refreshRosters()
    }
  }

  /** Rebuild every live session's open menu after the visible roster changed. */
  private refreshRosters(): void {
    for (const controller of this.live.controllers.values) {
      try {
        controller.refreshOpenMenu(true)
      } catch (error: unknown) {
        console.error('[ui-input-trigger] filter change menu refresh failed:', error)
      }
    }
  }

  /** Intersect all registered rules; a broken rule is reported and ignored. */
  private admits(session: ClientSessionContext, source: InputTriggerSource): boolean {
    return this.live.filters.every((filter) => {
      try {
        return filter(session, source)
      } catch (error: unknown) {
        console.error(`[ui-input-trigger] filter failed for "${source.trigger}${source.name}":`, error)
        return true
      }
    })
  }

  /**
   * Resolve the per-session controller for one session scope (lazy; the
   * scope disposer removes and disposes it). Construction warms the source
   * roster once — sessions are always agent-backed, so scope birth is the
   * single prewarm moment.
   * @param actx - session-scope ctx.
   * @returns the resident controller.
   * @throws when the Context no longer belongs to a retained Session generation.
   */
  sessionOf(actx: ClientContext): InputTriggerController {
    const sessions = this.sessions()
    const session = sessions.sessionOf(actx)
    const binding = session === undefined ? undefined : sessions.binding(session.sessionId)
    if (binding === undefined || binding.session !== session) {
      throw new Error('slash.sessionOf requires a retained Session scope')
    }
    const id = binding.sessionId
    const { live } = this
    const existing = live.controllers.get(binding)
    if (existing !== undefined) return existing
    const visible = (source: InputTriggerSource): boolean => this.admits({ sessionId: id }, source)
    const controller = new InputTriggerController({
      actx: binding.ctx,
      sessionId: id,
      roster: {
        sources: trigger => live.sources
          .filter(s => s.trigger === trigger && visible(s))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        all: () => live.sources.filter(visible),
      },
    })
    live.controllers.set(binding, controller)
    binding.ctx.effect(() => () => {
      controller.dispose()
      live.controllers.delete(binding)
    }, 'slash: session controller')
    return controller
  }

  private sessions(): ISessions {
    const sessions = this.ctx.get('sessions')
    if (sessions === undefined) throw new Error('ui-input-trigger: sessions service unavailable')
    return sessions
  }
}
