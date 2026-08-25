import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MusicChat } from './music-chat';

describe('MusicChat', () => {
  let component: MusicChat;
  let fixture: ComponentFixture<MusicChat>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MusicChat],
    }).compileComponents();

    fixture = TestBed.createComponent(MusicChat);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
