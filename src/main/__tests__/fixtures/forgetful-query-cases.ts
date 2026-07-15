import { MusicRepository, type Track } from '../../persistence/database'

export interface ForgetfulQueryCase {
  query: string
  expectedTitle: string
  rememberedBy: string
}

export const forgetfulQueryCases: ForgetfulQueryCase[] = [
  { query: '夜曲', expectedTitle: '夜曲', rememberedBy: '歌名' },
  { query: '周杰伦', expectedTitle: '夜曲', rememberedBy: '歌手' },
  { query: '十一月的萧邦', expectedTitle: '夜曲', rememberedBy: '专辑' },
  { query: '深夜', expectedTitle: '夜曲', rememberedBy: '标签' },
  { query: '宿舍熄灯', expectedTitle: '夜曲', rememberedBy: '感悟' },
  { query: '为你弹奏肖邦', expectedTitle: '夜曲', rememberedBy: '别名' },
  { query: '乌鸦掠过屋顶', expectedTitle: '夜曲', rememberedBy: '错记歌词' },
  { query: '高速路那首', expectedTitle: '公路之歌', rememberedBy: '别名' },
  { query: '隧道 鼓点', expectedTitle: '公路之歌', rememberedBy: '感悟组合词' },
  { query: '青海湖', expectedTitle: '公路之歌', rememberedBy: '事件地点' },
  { query: '小林', expectedTitle: '公路之歌', rememberedBy: '事件人物' },
  { query: '旅行清单', expectedTitle: '旅行的意义', rememberedBy: '其他线索' },
  { query: '码头轻声哼唱', expectedTitle: 'City of Stars', rememberedBy: '其他线索' },
  { query: 'la la land', expectedTitle: 'City of Stars', rememberedBy: '大小写专辑名' },
  { query: '毕业晚会', expectedTitle: '海阔天空', rememberedBy: '事件' },
  { query: '粤语大合唱', expectedTitle: '海阔天空', rememberedBy: '其他线索' },
  { query: '片尾字幕', expectedTitle: '大鱼', rememberedBy: '感悟' },
  { query: '沙漠旅馆', expectedTitle: 'Hotel California', rememberedBy: '别名' },
  { query: '柠檬味道', expectedTitle: 'Lemon', rememberedBy: '错记歌词' },
  { query: '教堂钟声', expectedTitle: 'Viva La Vida', rememberedBy: '感悟' },
  { query: 'ＶＩＶＡ', expectedTitle: 'Viva La Vida', rememberedBy: '全角歌名片段' },
  { query: '寂静之声', expectedTitle: 'The Sound of Silence', rememberedBy: '中文别名' },
  { query: '高中同学婚礼', expectedTitle: '小幸运', rememberedBy: '事件名称' },
  { query: '榕树礼堂', expectedTitle: '小幸运', rememberedBy: '事件地点' },
  { query: '西北公路纪录片', expectedTitle: '平凡之路', rememberedBy: '其他线索' }
]

export function seedForgetfulLibrary(repository: MusicRepository): Map<string, Track> {
  const tracks = new Map<string, Track>()
  const addTrack = (title: string, artist: string, album: string): Track => {
    const track = repository.createTrack({ title, artist, album, durationMs: null })
    tracks.set(title, track)
    return track
  }
  const addTag = (track: Track, name: string): void => {
    const tag = repository.createTag(name)
    repository.tagTrack(track.id, tag.id)
  }

  const nocturne = addTrack('夜曲', '周杰伦', '十一月的萧邦')
  addTag(nocturne, '深夜')
  repository.addNote(nocturne.id, '大学宿舍熄灯后戴着耳机循环')
  repository.addAlias(nocturne.id, '为你弹奏肖邦', 'alias')
  repository.addAlias(nocturne.id, '我总把开头记成乌鸦掠过屋顶', 'lyric')

  const roadSong = addTrack('公路之歌', '痛仰', '不要停止我的音乐')
  addTag(roadSong, '自驾')
  repository.addNote(roadSong.id, '过隧道时鼓点突然响起来')
  repository.addAlias(roadSong.id, '高速路那首', 'alias')

  const travel = addTrack('旅行的意义', '陈绮贞', '华丽的冒险')
  addTag(travel, '旅行')
  repository.addAlias(travel.id, '轻声唱旅行清单的女声', 'cue')

  const roadMemory = repository.createMemory(
    '青海湖自驾',
    '日落后沿湖开车',
    '2025-08-16T20:30:00.000Z',
    '青海湖',
    '小林和小周'
  )
  repository.setMemoryTracks(roadMemory.id, [roadSong.id, travel.id])

  const city = addTrack('City of Stars', 'Ryan Gosling & Emma Stone', 'La La Land')
  repository.addAlias(city.id, '男女在码头轻声哼唱', 'cue')
  repository.addNote(city.id, '第一次在老电影院看午夜场')

  const beyond = addTrack('海阔天空', 'Beyond', '乐与怒')
  addTag(beyond, '毕业')
  repository.addNote(beyond.id, '毕业晚会全班合唱')
  repository.addAlias(beyond.id, '粤语大合唱那首', 'cue')
  const graduation = repository.createMemory(
    '高中毕业晚会',
    '操场散场前大家一起唱歌',
    '2020-06-20T13:00:00.000Z',
    '学校操场',
    '高三同学'
  )
  repository.linkMemoryTrack(graduation.id, beyond.id)

  const bigFish = addTrack('大鱼', '周深', '大鱼海棠')
  addTag(bigFish, '动画')
  repository.addNote(bigFish.id, '电影片尾字幕升起时听到')
  repository.addAlias(bigFish.id, '女声一样空灵的男声', 'cue')

  const hotel = addTrack('Hotel California', 'Eagles', 'Hotel California')
  addTag(hotel, '吉他')
  repository.addNote(hotel.id, '吉他尾奏很长的沙漠公路歌曲')
  repository.addAlias(hotel.id, '沙漠旅馆', 'alias')

  const lemon = addTrack('Lemon', '米津玄師', 'Bootleg')
  addTag(lemon, '日剧')
  repository.addAlias(lemon.id, '我错记成雨后还有柠檬味道', 'lyric')
  repository.addAlias(lemon.id, '日剧片尾那首', 'cue')

  const viva = addTrack('Viva La Vida', 'Coldplay', 'Viva la Vida or Death and All His Friends')
  addTag(viva, '跑步')
  repository.addNote(viva.id, '跑步最后一公里听见教堂钟声')
  repository.addAlias(viva.id, '像国王回忆往事', 'cue')

  const silence = addTrack('The Sound of Silence', 'Simon & Garfunkel', 'Sounds of Silence')
  addTag(silence, '雨夜')
  repository.addAlias(silence.id, '寂静之声', 'alias')
  repository.addNote(silence.id, '雨声里听的那首老歌')

  const luck = addTrack('小幸运', '田馥甄', '我的少女时代')
  addTag(luck, '婚礼')
  const wedding = repository.createMemory(
    '高中同学婚礼',
    '新娘入场时大家忽然安静下来',
    '2025-05-01T04:00:00.000Z',
    '榕树礼堂',
    '阿禾和小雨'
  )
  repository.linkMemoryTrack(wedding.id, luck.id)

  const ordinaryRoad = addTrack('平凡之路', '朴树', '猎户星座')
  addTag(ordinaryRoad, '公路')
  repository.addAlias(ordinaryRoad.id, '西北公路纪录片结尾', 'cue')

  return tracks
}
