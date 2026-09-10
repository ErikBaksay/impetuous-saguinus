import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { DrivingGame, GameMode, GameState, INITIAL_STATE } from './game/game';
@Component({ selector: 'app-root', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './app.component.html' })
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('viewport', { static: true }) viewport!: ElementRef<HTMLDivElement>;
  @ViewChild('minimap', { static: true }) minimap!: ElementRef<HTMLCanvasElement>;
  readonly state = signal<GameState>({ ...INITIAL_STATE }); readonly controls = signal(false);
  game?: DrivingGame;
  ngAfterViewInit(): void { this.game = new DrivingGame(this.viewport.nativeElement, this.minimap.nativeElement, s => this.state.set(s)); }
  start(mode: GameMode): void { this.controls.set(false); this.game?.start(mode); (document.activeElement as HTMLElement | null)?.blur(); }
  pause(): void { this.game?.pause(); (document.activeElement as HTMLElement | null)?.blur(); }
  fullscreen(): void { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); }
  reload(): void { location.reload(); }
  ngOnDestroy(): void { this.game?.dispose(); }
}
