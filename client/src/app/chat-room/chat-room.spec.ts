import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatRoom } from './chat-room';

describe('ChatRoom', () => {
  let component: ChatRoom;
  let fixture: ComponentFixture<ChatRoom>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatRoom],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatRoom);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/my/groups').flush([{ id: 1, name: 'Study' }]);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/groups/1/members')
      .flush({ canManage: true, members: [{ id: 1, username: 'Cherry', isGroupAdmin: true }, { id: 2, username: 'James', isGroupAdmin: false }] });
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/groups/1/join-requests').flush([]);
    await fixture.whenStable();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Group Members');
    expect(fixture.nativeElement.textContent).toContain('Make Group Admin');
    const rooms = fixture.nativeElement.querySelector('.rooms');
    expect(rooms.lastElementChild.tagName.toLowerCase()).toBe('app-leave-group');
  });
});
