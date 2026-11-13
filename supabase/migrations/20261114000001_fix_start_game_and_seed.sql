-- ============================================================================
-- BREAK ROOM ARCADE: CONTENT SEED & ENGINE START_GAME FIX
-- ============================================================================
-- Migration: 20261114000001_fix_start_game_and_seed.sql

-- 1. Ensure content_items & room_content_used exist with RLS policies
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('quiz', 'pictionary', 'charades', 'typing')),
  payload jsonb not null,
  category text not null,
  difficulty smallint not null check (difficulty between 1 and 3),
  content_hash text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint uq_game_content_hash unique (game, content_hash)
);

create table if not exists public.room_content_used (
  room_id uuid not null references public.rooms(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (room_id, content_id)
);

alter table public.content_items enable row level security;
alter table public.room_content_used enable row level security;

drop policy if exists "Allow read content items" on public.content_items;
create policy "Allow read content items" on public.content_items for select using (true);

drop policy if exists "Allow room members read used content" on public.room_content_used;
create policy "Allow room members read used content" on public.room_content_used for all using (true);

-- 2. Populate 330 seed items (Quiz, Pictionary, Charades, Typing)
insert into public.content_items (game, payload, category, difficulty, content_hash)
values
('quiz', '{"question":"Which planet in our solar system has the most moons?","options":["Jupiter","Saturn","Uranus","Neptune"],"answerIndex":1,"category":"science","difficulty":1,"explanation":"Saturn leads with over 140 recognized moons."}'::jsonb, 'science', 1, 'd749a0101d39f5dfb60c7c9bcf2abf76bee7c7770f5256e151d5942a2f90807e'),
('quiz', '{"question":"What does ''HTTP'' stand for in web addresses?","options":["HyperText Transfer Protocol","High Traffic Transmission Path","Hyperlink Text Transmission Policy","Hyper Terminal Text Program"],"answerIndex":0,"category":"technology","difficulty":1,"explanation":"HTTP is the foundational protocol for data communication on the Web."}'::jsonb, 'technology', 1, '2af03c4d5ac119c19cd40ce1037bce0afc77c8b98975732f905b904e051f99c6'),
('quiz', '{"question":"Which city is known as the ''Silicon Valley of India''?","options":["Hyderabad","Bengaluru","Pune","Chennai"],"answerIndex":1,"category":"india","difficulty":1,"explanation":"Bengaluru is India''s premier tech hub."}'::jsonb, 'india', 1, 'd62b998e190580a82c5ac5cbd611a5495d5c80735c0c0f5bc97481ce130124c8'),
('quiz', '{"question":"Who directed the 2010 sci-fi blockbuster ''Inception''?","options":["Steven Spielberg","Christopher Nolan","James Cameron","Denis Villeneuve"],"answerIndex":1,"category":"movies","difficulty":1,"explanation":"Christopher Nolan wrote and directed Inception."}'::jsonb, 'movies', 1, '91d2171b7a313cc9b5dbbd13bf7939df627ce40e3ebfa8db464f0c024f0128e8'),
('quiz', '{"question":"What is the primary ingredient in traditional hummus?","options":["Lentils","Chickpeas","Black beans","Soybeans"],"answerIndex":1,"category":"food","difficulty":1,"explanation":"Hummus is made from mashed chickpeas, tahini, lemon, and garlic."}'::jsonb, 'food', 1, 'f3e456a8e83642b0897031b60954d6aec3852bfce1e334822c16567c77d85932'),
('quiz', '{"question":"Which country has won the most FIFA Men''s World Cup titles?","options":["Germany","Italy","Argentina","Brazil"],"answerIndex":3,"category":"sports","difficulty":1,"explanation":"Brazil has won the World Cup 5 times."}'::jsonb, 'sports', 1, 'e2c69b797ffd08fa5d4933cc2e81da2cb3e1d084bfd40415fdd34162ca5b7924'),
('quiz', '{"question":"What is the powerhouse organelle of the biological cell?","options":["Nucleus","Ribosome","Mitochondria","Endoplasmic Reticulum"],"answerIndex":2,"category":"science","difficulty":1,"explanation":"Mitochondria produce ATP, the cellular energy currency."}'::jsonb, 'science', 1, '7d56a63b8d17a8900b51d2310e04e86d2629fd0465cc36526b8d4ffb24b0ffeb'),
('quiz', '{"question":"In computing, how many bits make up one single byte?","options":["4","8","16","32"],"answerIndex":1,"category":"technology","difficulty":1,"explanation":"One byte consists of exactly 8 bits."}'::jsonb, 'technology', 1, '1a3bac568bfff62595cded43d3c629efb7834de63797af9b588643f041d16d99'),
('quiz', '{"question":"Which river is the longest in the entire world?","options":["Amazon","Nile","Yangtze","Mississippi"],"answerIndex":1,"category":"geography","difficulty":1,"explanation":"The Nile River in Africa is traditionally recognized as the longest."}'::jsonb, 'geography', 1, '7b6892c608d5975635e817e8e2e8a4766d9f53bff3b55dada04c287d0c08efbd'),
('quiz', '{"question":"In an office meeting, what does ''KPI'' commonly stand for?","options":["Key Performance Indicator","Known Project Index","Key Process Integration","Knowledge Point Identifier"],"answerIndex":0,"category":"workplace","difficulty":1,"explanation":"KPI measures performance toward key business objectives."}'::jsonb, 'workplace', 1, '7e62ccd3123b347189a399cc3daa464c3de67bf3587007b2dd15657e43167d74'),
('quiz', '{"question":"Which musical instrument features 88 black and white keys?","options":["Harpsichord","Accordion","Organ","Piano"],"answerIndex":3,"category":"music","difficulty":1,"explanation":"A standard modern piano has 52 white and 36 black keys."}'::jsonb, 'music', 1, 'd81f1ad1daa9f989a8fb0ffc91f543a163e17828624066305141c16ccd8cc815'),
('quiz', '{"question":"What is the chemical symbol for the element Gold?","options":["Ag","Au","Fe","Pb"],"answerIndex":1,"category":"science","difficulty":1,"explanation":"Au originates from the Latin word for gold, ''aurum''."}'::jsonb, 'science', 1, 'a1ed7ba4fb6e72d7763d6bc5a2f7314ea44231c5d55fc9d1041a530aa4253843'),
('quiz', '{"question":"Who was the first woman to win a Nobel Prize?","options":["Marie Curie","Rosalind Franklin","Mother Teresa","Ada Lovelace"],"answerIndex":0,"category":"history","difficulty":1,"explanation":"Marie Curie won the Nobel Prize in Physics in 1903."}'::jsonb, 'history', 1, '285a8b79cb09af38696d2c379ff3fa44eb13e64fe9b72440565354f586504a54'),
('quiz', '{"question":"Which Indian monument was built by Emperor Shah Jahan in memory of his wife?","options":["Red Fort","Qutub Minar","Taj Mahal","Hawa Mahal"],"answerIndex":2,"category":"india","difficulty":1,"explanation":"The Taj Mahal in Agra was commissioned by Shah Jahan."}'::jsonb, 'india', 1, 'f86a549f5629431c20fdb1b073bd04772217469f8502f9d46d8375b03c52468d'),
('quiz', '{"question":"What is the capital city of Australia?","options":["Sydney","Melbourne","Brisbane","Canberra"],"answerIndex":3,"category":"geography","difficulty":1,"explanation":"Canberra was chosen as the capital as a compromise between Sydney and Melbourne."}'::jsonb, 'geography', 1, '563bead548fbeaa45d9187ad2dab5902dc226b3cb6fac82dc0baa18d8cc59d3d'),
('quiz', '{"question":"Which company created the Android mobile operating system before Google acquired it?","options":["Android Inc.","Sun Microsystems","Motorola","Palm Inc."],"answerIndex":0,"category":"technology","difficulty":2,"explanation":"Android Inc. was co-founded by Andy Rubin in 2003."}'::jsonb, 'technology', 2, 'cbcba3e84f63bd665df96fd2cb4703e3213cd7d1c1ae5d6aa520a42d1da20783'),
('quiz', '{"question":"What is the national animal of India?","options":["Asiatic Lion","Royal Bengal Tiger","Indian Elephant","Peacock"],"answerIndex":1,"category":"india","difficulty":1,"explanation":"The Royal Bengal Tiger is the national animal of India."}'::jsonb, 'india', 1, 'b586d750dea68c9470c79d15aa93e1f8d711617bff13d891dcdcfd3eb25946f1'),
('quiz', '{"question":"Which famous artist painted the ceiling of the Sistine Chapel?","options":["Leonardo da Vinci","Michelangelo","Raphael","Donatello"],"answerIndex":1,"category":"history","difficulty":2,"explanation":"Michelangelo painted the chapel ceiling between 1508 and 1512."}'::jsonb, 'history', 2, 'd10c3db5a65b6184e863be432df601f10f0cee820cdfea79ffa37db938df59f4'),
('quiz', '{"question":"In Git, which command creates and switches to a new branch in one step?","options":["git branch -n","git checkout -b","git switch -c","git new -b"],"answerIndex":1,"category":"technology","difficulty":2,"explanation":"git checkout -b (or git switch -c) creates and switches branch."}'::jsonb, 'technology', 2, '8a79f47fdf3cc55fcfadbcb6b1d45ee42f11d1240431fea0ff96e23bfffefeef'),
('quiz', '{"question":"Which spice is famously the most expensive by weight in the world?","options":["Cardamom","Vanilla","Saffron","Truffle"],"answerIndex":2,"category":"food","difficulty":2,"explanation":"Saffron requires harvesting thousands of delicate flower stigmas by hand."}'::jsonb, 'food', 2, '2907dc91724aa217566692774963f609242b2a537a3908953e29b01c5dcfc8c6'),
('quiz', '{"question":"How many players are on the pitch for one team in a standard cricket match?","options":["9","10","11","12"],"answerIndex":2,"category":"sports","difficulty":1,"explanation":"Cricket is played with 11 players per side."}'::jsonb, 'sports', 1, 'b8319eb3b7582375abde431046cf0754abe8c68be7f80309ddb253785fd2a847'),
('quiz', '{"question":"Which Greek philosopher was the dedicated tutor of Alexander the Great?","options":["Socrates","Plato","Aristotle","Pythagoras"],"answerIndex":2,"category":"history","difficulty":2,"explanation":"Aristotle tutored young Alexander in Macedon."}'::jsonb, 'history', 2, '53a4418bc3a4294b1269c17f473bc19c914905d79773cdae002196dd7b6b5b81'),
('quiz', '{"question":"In office communication, what does ''EOD'' stand for?","options":["End of Discussion","End of Day","Early Output Delivery","Estimated Operational Delay"],"answerIndex":1,"category":"workplace","difficulty":1,"explanation":"EOD indicates the task is expected before work finishes today."}'::jsonb, 'workplace', 1, '176cf50914f38834c6502c37f02a5a16ce4f37d6ba0ac400cc9668e17a12b6be'),
('quiz', '{"question":"What is the hardest naturally occurring substance on Earth?","options":["Titanium","Diamond","Tungsten","Graphene"],"answerIndex":1,"category":"science","difficulty":1,"explanation":"Diamond is ranked 10 on the Mohs hardness scale."}'::jsonb, 'science', 1, '68cbbfd8d2d0a2a71e9934839e18a789ba543dd4a6724d603d960a28be0509eb'),
('quiz', '{"question":"Which Indian festival is widely known as the ''Festival of Lights''?","options":["Holi","Diwali","Eid","Navratri"],"answerIndex":1,"category":"india","difficulty":1,"explanation":"Diwali celebrates the spiritual victory of light over darkness."}'::jsonb, 'india', 1, '2218c2cc66db33a3f0807b215cf94b2c2a7de62f5f4315b69631538956e68b45'),
('quiz', '{"question":"Who composed the iconic soundtrack for the film ''Slumdog Millionaire''?","options":["A. R. Rahman","Hans Zimmer","John Williams","Ennio Morricone"],"answerIndex":0,"category":"music","difficulty":1,"explanation":"A. R. Rahman won two Academy Awards for the film''s music."}'::jsonb, 'music', 1, '04580bd40fdf46b3c6582b934321dd1e7ad32bc446478c0a754554dc10872c76'),
('quiz', '{"question":"What year did the Apollo 11 mission successfully land astronauts on the Moon?","options":["1965","1969","1971","1973"],"answerIndex":1,"category":"history","difficulty":1,"explanation":"Neil Armstrong stepped on the Moon on July 20, 1969."}'::jsonb, 'history', 1, '578f4697ee45078695660d23354231a4a9ff234b5013fe08d394a26a2fb86692'),
('quiz', '{"question":"Which sea lies between Europe, Asia, and Africa?","options":["Baltic Sea","Mediterranean Sea","Red Sea","Caribbean Sea"],"answerIndex":1,"category":"geography","difficulty":2,"explanation":"The Mediterranean Sea connects three continents."}'::jsonb, 'geography', 2, 'c5e5eaf18464db587b956861c20d95b79628154b23bed188436493ab8842af84'),
('quiz', '{"question":"In web development, which CSS layout module is best suited for 1-dimensional layouts?","options":["Flexbox","Grid","Float","Table"],"answerIndex":0,"category":"technology","difficulty":2,"explanation":"Flexbox handles rows or columns; Grid handles 2 dimensions."}'::jsonb, 'technology', 2, '4f7100480a6caca7e204df0a1841ca62efa1dc18069e14406617f71cb24f4c16'),
('quiz', '{"question":"What does ''ROI'' stand for in business and project management?","options":["Rate of Interest","Return on Investment","Risk of Implementation","Realized Output Index"],"answerIndex":1,"category":"workplace","difficulty":1,"explanation":"Return on Investment measures the financial return of a venture."}'::jsonb, 'workplace', 1, '743a9b95fc6cf5d4982d96b2a4e35c7c60de427c477084554f694096dff1229a'),
('quiz', '{"question":"Which Japanese dish consists of vinegared rice combined with seafood or vegetables?","options":["Ramen","Tempura","Sushi","Udon"],"answerIndex":2,"category":"food","difficulty":1,"explanation":"The word sushi refers specifically to seasoned vinegared rice."}'::jsonb, 'food', 1, '9c8b9b52c49d54599af8e2731f2b57bcaac69e669cf59d17d2a266396cdfc328'),
('quiz', '{"question":"Which tennis Grand Slam tournament is played strictly on grass courts?","options":["Australian Open","Roland Garros","Wimbledon","US Open"],"answerIndex":2,"category":"sports","difficulty":1,"explanation":"Wimbledon is the world''s oldest and only grass-court Grand Slam."}'::jsonb, 'sports', 1, '6dd8ad0cec9aec9214a70e0df1620a50d9a3421f3bf61250ddaced5cfd2e492c'),
('quiz', '{"question":"What gas do green plants absorb from the air during photosynthesis?","options":["Oxygen","Carbon Dioxide","Nitrogen","Hydrogen"],"answerIndex":1,"category":"science","difficulty":1,"explanation":"Plants absorb carbon dioxide (CO2) to produce glucose and oxygen."}'::jsonb, 'science', 1, 'f0cbc34887b579000f661e3d328153e7f91a4baa39e89cc344d3840bce5b9b68'),
('quiz', '{"question":"In typography, which font category does NOT have small decorative lines on strokes?","options":["Serif","Sans-Serif","Monospace","Blackletter"],"answerIndex":1,"category":"technology","difficulty":1,"explanation":"''Sans'' means without serifs in French."}'::jsonb, 'technology', 1, '4975d51dc5ab9c74899aa159fc0f0dd35bc7a041efb802bd53c82fe7d5c71bd7'),
('quiz', '{"question":"What is the currency of the United Kingdom?","options":["Euro","Dollar","Pound Sterling","Franc"],"answerIndex":2,"category":"general","difficulty":1,"explanation":"The British Pound (GBP) is the official currency."}'::jsonb, 'general', 1, '187da6ea0463cff5927278745ae4077926fb9972e37a9273e7bffc4a6878ec7a'),
('quiz', '{"question":"Which mountain range separates Europe from Asia?","options":["Alps","Ural Mountains","Himalayas","Rockies"],"answerIndex":1,"category":"geography","difficulty":2,"explanation":"The Urals in Russia form the traditional geographic border."}'::jsonb, 'geography', 2, 'd9261d351a4cb72d07ae6518ae30206342a5ff08c87cb6b596d8a680a26a7be9'),
('quiz', '{"question":"What is the main spirit used in a classic Mojito cocktail?","options":["Vodka","White Rum","Gin","Tequila"],"answerIndex":1,"category":"food","difficulty":2,"explanation":"A Mojito combines white rum, sugar, lime, soda, and mint."}'::jsonb, 'food', 2, '881f323e6dd742205f9fbddbd2ffae6d3d175c91662efce1f023f522bed675d2'),
('quiz', '{"question":"Who developed the theory of General Relativity?","options":["Isaac Newton","Albert Einstein","Niels Bohr","Max Planck"],"answerIndex":1,"category":"science","difficulty":1,"explanation":"Einstein published General Relativity in 1915."}'::jsonb, 'science', 1, '23d8e3f9e34a621476c740144a00114a1e0476011e30f3ad525672fc173b45ab'),
('quiz', '{"question":"Which ocean borders India to the south?","options":["Atlantic Ocean","Pacific Ocean","Indian Ocean","Arctic Ocean"],"answerIndex":2,"category":"india","difficulty":1,"explanation":"The Indian Ocean surrounds the Indian subcontinent."}'::jsonb, 'india', 1, '7ad382544d954c4ef68026ce99e8fa21478767f199f67bb004f94f9bdcc37031'),
('quiz', '{"question":"What does the ''S'' stand for in HTTPS?","options":["System","Standard","Secure","Server"],"answerIndex":2,"category":"technology","difficulty":1,"explanation":"HTTPS stands for HyperText Transfer Protocol Secure."}'::jsonb, 'technology', 1, '29c5c2b4e6b3042fd95e77fd7be4c1c9df1d8cd2b191d12439e0794525eb498c'),
('quiz', '{"question":"In corporate email culture, what is ''OOO'' short for?","options":["Out of Order","Out of Office","Overdue Online Order","Operational Overview Output"],"answerIndex":1,"category":"workplace","difficulty":1,"explanation":"OOO auto-responders let colleagues know you are away."}'::jsonb, 'workplace', 1, '7a8dcef0e6b04d9da2d7f2006268f278eb006fc2379d32f547571d9a19529a7a'),
('quiz', '{"question":"Which band released the celebrated 1969 album ''Abbey Road''?","options":["The Rolling Stones","The Beatles","Led Zeppelin","Queen"],"answerIndex":1,"category":"music","difficulty":1,"explanation":"The Beatles recorded Abbey Road at EMI Studios."}'::jsonb, 'music', 1, 'b9c19a00856db7447482cb2b80ae1ad5fd78e0bdcdd4a728b29b501d58ca8f51'),
('quiz', '{"question":"Which country is home to the ancient ruins of Machu Picchu?","options":["Chile","Bolivia","Peru","Colombia"],"answerIndex":2,"category":"geography","difficulty":1,"explanation":"Machu Picchu is a 15th-century Inca citadel in Peru."}'::jsonb, 'geography', 1, '27d5cd6872ead46fd31aa8f0ae9184c5df6237210013776caa28023734efe888'),
('quiz', '{"question":"What is the speed of light in a vacuum approximately in km/s?","options":["150,000 km/s","300,000 km/s","500,000 km/s","1,000,000 km/s"],"answerIndex":1,"category":"science","difficulty":2,"explanation":"Light travels at roughly 299,792 kilometers per second."}'::jsonb, 'science', 2, '15e3fc0ad9500bb3ef11918b4705bb6fd38f58d839cb8f528ddb83ca3260ac55'),
('quiz', '{"question":"Who is the protagonist and archaeologist in the movie ''Raiders of the Lost Ark''?","options":["Allan Quatermain","Indiana Jones","Rick O''Connell","Lara Croft"],"answerIndex":1,"category":"movies","difficulty":1,"explanation":"Harrison Ford starred as Dr. Henry ''Indiana'' Jones."}'::jsonb, 'movies', 1, 'dcd325b2fd6a53af1e8c5f1276a8fd50b4d070999486185b6b935d318aed4018'),
('quiz', '{"question":"Which Indian state has Malayalam as its official language?","options":["Tamil Nadu","Karnataka","Kerala","Andhra Pradesh"],"answerIndex":2,"category":"india","difficulty":1,"explanation":"Malayalam is predominantly spoken in Kerala."}'::jsonb, 'india', 1, '755c7dc0d219d955e670f777565b2eaae7dcec11b45831e3a09b455277ba1a32'),
('quiz', '{"question":"What programming language was initially created by Brendan Eich in just 10 days?","options":["Python","Java","JavaScript","PHP"],"answerIndex":2,"category":"technology","difficulty":2,"explanation":"Eich created JavaScript at Netscape in 1995."}'::jsonb, 'technology', 2, '918ba9ea5074c588895fa16e12009854fdcbadd99efe32df4a366b70588e4fda'),
('quiz', '{"question":"What does ''PTO'' commonly denote on a team calendar?","options":["Paid Time Off","Project Task Overview","Priority Technical Order","Personal Training Option"],"answerIndex":0,"category":"workplace","difficulty":1,"explanation":"PTO represents approved employee leave."}'::jsonb, 'workplace', 1, 'b3e2b0f2fa029b2dc329571e553151c4963357dd2ea5805ed092e747a12d3e8e'),
('quiz', '{"question":"Which chess piece can leap over other pieces on the board?","options":["Bishop","Knight","Rook","Pawn"],"answerIndex":1,"category":"sports","difficulty":1,"explanation":"The Knight moves in an ''L'' shape and can jump over pieces."}'::jsonb, 'sports', 1, '68256ed7551f8dde3e6c6d4178a0bda5cf141d812c8841f2fb8a4d9d426c933f'),
('quiz', '{"question":"What is the largest internal organ in the human body?","options":["Heart","Brain","Liver","Lungs"],"answerIndex":2,"category":"science","difficulty":2,"explanation":"The liver is the heaviest and largest internal organ."}'::jsonb, 'science', 2, 'd293f5629fee12aabdf418b7bbd5c12750bbb7af4c0661ffb23a7017acfe99ba'),
('quiz', '{"question":"Which planet is known as the ''Red Planet''?","options":["Venus","Mars","Mercury","Jupiter"],"answerIndex":1,"category":"science","difficulty":1,"explanation":"Mars appears reddish due to iron oxide (rust) on its surface."}'::jsonb, 'science', 1, '1e941ae5d0a2c9935c34ff207a9a7c95149bd07ae2d89b0c5e889d2407de04a5'),
('quiz', '{"question":"What is the square root of 144?","options":["11","12","13","14"],"answerIndex":1,"category":"general","difficulty":1,"explanation":"12 times 12 equals 144."}'::jsonb, 'general', 1, 'f8ff871a1b8fb5e075bf5036ee74152d6038aa35ac516030bb517a0b608a5a8a'),
('quiz', '{"question":"Which country gifted the Statue of Liberty to the United States?","options":["United Kingdom","France","Spain","Italy"],"answerIndex":1,"category":"history","difficulty":1,"explanation":"France gifted the statue to celebrate the alliance during the American Revolution."}'::jsonb, 'history', 1, '708d05b9b1c6c2042efbe1bc41fb3165861e05ecf5375b9b7a8aa53e247dae13'),
('quiz', '{"question":"Which coffee drink is made with equal parts espresso, steamed milk, and milk foam?","options":["Latte","Americano","Cappuccino","Macchiato"],"answerIndex":2,"category":"food","difficulty":1,"explanation":"A traditional cappuccino features equal thirds of each."}'::jsonb, 'food', 1, 'd44bd85b73f2e0e949087cc817e247b165135e45124e872b2328a3afb12a05fd'),
('quiz', '{"question":"Who is known as the ''Father of the Indian Constitution''?","options":["Mahatma Gandhi","Dr. B. R. Ambedkar","Jawaharlal Nehru","Sardar Patel"],"answerIndex":1,"category":"india","difficulty":1,"explanation":"Dr. Ambedkar was the chief architect of the Constitution of India."}'::jsonb, 'india', 1, '75ddcb7a3cee55a3eb817440d1807ab01ac4dca13835fc1192b14343cdb6f0d8'),
('quiz', '{"question":"In database terminology, what does ''ACID'' ensure for transactions?","options":["Speed and Compression","Reliability and Consistency","Scalability and Partitioning","Encryption and Security"],"answerIndex":1,"category":"technology","difficulty":2,"explanation":"ACID stands for Atomicity, Consistency, Isolation, and Durability."}'::jsonb, 'technology', 2, '6a2879bdb1bdc01414f87f80f49a36d77325040216d5780992590cbac905fb12'),
('quiz', '{"question":"Which sport features terms like ''love'', ''deuce'', and ''fault''?","options":["Badminton","Tennis","Squash","Table Tennis"],"answerIndex":1,"category":"sports","difficulty":1,"explanation":"These are traditional scoring and penalty terms in tennis."}'::jsonb, 'sports', 1, '6e49284710779fbc40a8113db69ac0c215ff3235b05dd9b3091a0e12be920b32'),
('quiz', '{"question":"What is the capital city of Japan?","options":["Kyoto","Osaka","Tokyo","Yokohama"],"answerIndex":2,"category":"geography","difficulty":1,"explanation":"Tokyo has been the capital of Japan since 1868."}'::jsonb, 'geography', 1, '4dc29dc0da89c13f7d2e062c123e167935a1436c0c06486a7698678c31f46a02'),
('quiz', '{"question":"Which superhero is known as the ''Man of Steel''?","options":["Iron Man","Superman","Batman","Thor"],"answerIndex":1,"category":"movies","difficulty":1,"explanation":"Superman is famously titled the Man of Steel."}'::jsonb, 'movies', 1, 'aa42e26d55bfe92effbc867c77e2cafe427873a45cfeb04a8e1c1b62e2476ed5'),
('quiz', '{"question":"In project management, what is a ''standup''?","options":["A comedy show","A short daily sync meeting","A physical stretching session","A keynote presentation"],"answerIndex":1,"category":"workplace","difficulty":1,"explanation":"A daily standup aligns team members on yesterday, today, and blockers."}'::jsonb, 'workplace', 1, 'c8b791560cac162616758165196f363657b04e1157044d2ef525e2aaa34ecdf8'),
('pictionary', '{"word":"elephant","category":"animals","difficulty":1}'::jsonb, 'animals', 1, 'cd08c4c4316df20d9c30450fe776dcde4810029e641cde526c5bbffec1f770a3'),
('pictionary', '{"word":"giraffe","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '6bb7e067447139b18f6094d2d15bcc264affde89a8b9f5227fe5b38abd8b19d7'),
('pictionary', '{"word":"penguin","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '0a4346f806b28b3ce94905c3ac56fcd5ee2337d8613161696aba52eb0c3551cc'),
('pictionary', '{"word":"kangaroo","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '4a3484b3bf2fcb0ff5f717f18904abd29d228bc13098114df68b2ed9a4626503'),
('pictionary', '{"word":"octopus","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '5633c9b8af6d089859afcbec42fdc03f8c407aaba9668218b433bd4959911465'),
('pictionary', '{"word":"dolphin","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '532f011ec89ff0e2e1be76953593b588d47e8a454d18f554e4f2ea6d89615a10'),
('pictionary', '{"word":"butterfly","category":"animals","difficulty":1}'::jsonb, 'animals', 1, 'fcfd075cbe367c158d5cfaa31fa06656a3e68f626388d96ee81b35dda4310b58'),
('pictionary', '{"word":"crocodile","category":"animals","difficulty":2}'::jsonb, 'animals', 2, '02766f3002eaa501317fc1ac658a30ec6fba6be867f2624ce7d2b8bc31a83ca8'),
('pictionary', '{"word":"chameleon","category":"animals","difficulty":2}'::jsonb, 'animals', 2, 'ef58ef3c1e321df6d41ed2fd179df253ccd966a3212cb97eedf9b369334786af'),
('pictionary', '{"word":"flamingo","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '0ae2f6c706cff60bff7c0125b99cae8c53e1a1702f02316848bc99e597d084db'),
('pictionary', '{"word":"squirrel","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '960a38ace75a2fe9426aa5d48b536cc6db18a2023b9bdd698e562fc3023585a6'),
('pictionary', '{"word":"hedgehog","category":"animals","difficulty":2}'::jsonb, 'animals', 2, '064a43832b4f4f1dc9cefded25aaeb634a2fdfa9cfe9e26d4ad3297d9b2e4150'),
('pictionary', '{"word":"jellyfish","category":"animals","difficulty":1}'::jsonb, 'animals', 1, 'a0ea5328f032f1557fbc5d6516c59cc85e7c0fa270c43085f9c994ef2915449b'),
('pictionary', '{"word":"lobster","category":"animals","difficulty":2}'::jsonb, 'animals', 2, 'a2e1c40da1ae335d4dffe729eb4d5ca23b74b9e51fc535f4a804a261080c294d'),
('pictionary', '{"word":"rhinoceros","category":"animals","difficulty":2}'::jsonb, 'animals', 2, '7d212a337f4f05555052bb6dc8989346aee1f69eb97d6b4d241dcc9cc2ff3cfe'),
('pictionary', '{"word":"hippopotamus","category":"animals","difficulty":2}'::jsonb, 'animals', 2, 'db35fb45d1ebc6015e9b10296a3ad6f942a7bcc83d752f7d472b58d539937f83'),
('pictionary', '{"word":"mosquito","category":"animals","difficulty":2}'::jsonb, 'animals', 2, 'd19949c3d422029d06515a1be8b6ebca9733ca3dfbe1e30fc7253ae638d8139d'),
('pictionary', '{"word":"scorpion","category":"animals","difficulty":2}'::jsonb, 'animals', 2, '631ffa50b59a0051744dee00a0b9194d44b357cc91fc7595628a867c133f2102'),
('pictionary', '{"word":"spider","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '9bfa0b50a90e669907e78780bcc1e5e972742e0d124b30a67fbeb6371c604891'),
('pictionary', '{"word":"turtle","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '74dd730b5c36c1cb4fdbb4bce1764c57f260190f94ba52d877308332f1dfe363'),
('pictionary', '{"word":"hamster","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '12e1d34b00a928b8cebb6a5f739f656b339c0e9d2f4507148a5b1afdadd634d0'),
('pictionary', '{"word":"sloth","category":"animals","difficulty":2}'::jsonb, 'animals', 2, '068f5cfbbee6b482d1849e2f19cacf0151408f314c3bdcb025aeccb10a8ef69e'),
('pictionary', '{"word":"peacock","category":"animals","difficulty":2}'::jsonb, 'animals', 2, 'a095c7713e337faa7c397ce5fc77edf4b5fad49409b53ef54f382ac3b5b60a03'),
('pictionary', '{"word":"shark","category":"animals","difficulty":1}'::jsonb, 'animals', 1, '31fc15942b0c47f6c6408dd933a830b25dae3d9a0262dafe64d12e4492207e47'),
('pictionary', '{"word":"woodpecker","category":"animals","difficulty":3}'::jsonb, 'animals', 3, '5a2bb24dc707f2a69361994eed72ae17d218224abc13d487b9e89c3cd5873640'),
('pictionary', '{"word":"umbrella","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '2974744982f08b2077515f1e0dd62fd94b70d805831c994ad0a55b187ecdd1f9'),
('pictionary', '{"word":"telescope","category":"objects","difficulty":2}'::jsonb, 'objects', 2, '918d6b6a9b95943bf5e211e5a050e939376debc88121a682c17a7050cb6c7fa9'),
('pictionary', '{"word":"microscope","category":"objects","difficulty":2}'::jsonb, 'objects', 2, '0f09538d0ea075eeabc62998a7a6664a146c182a29444c86a7b13ffc3f033e6b'),
('pictionary', '{"word":"hourglass","category":"objects","difficulty":1}'::jsonb, 'objects', 1, 'af20a4cdb149e87bd038f3abdb309393a087c451718d7927780afe6e80c8279a'),
('pictionary', '{"word":"flashlight","category":"objects","difficulty":1}'::jsonb, 'objects', 1, 'b982eabb1680523bf09816a0996b8dd057b1cded480f8f9ce037095549375107'),
('pictionary', '{"word":"compass","category":"objects","difficulty":1}'::jsonb, 'objects', 1, 'd1068beeb96a6a79937661d5cc9f290dddaa5730e64b7ab2b238078a1194c614'),
('pictionary', '{"word":"anchor","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '79bfb0e2ba76b9d447606ddbcc494834f05a4c11deb052e74b49ea307a3c5bcd'),
('pictionary', '{"word":"skateboard","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '2406f46e506c14b5a93679beacf9a89f6878521a444455866726d7a4ea9f6fe9'),
('pictionary', '{"word":"parachute","category":"objects","difficulty":2}'::jsonb, 'objects', 2, 'a438450d6ba8f12daa4f1f7ee389bd1b945a812336ab79a86f41bacb6c790bbe'),
('pictionary', '{"word":"submarine","category":"objects","difficulty":2}'::jsonb, 'objects', 2, '3a48c2443b07faa22ab4b5556b29b69b03f03bb5766f4757b5b57be97d04e1b0'),
('pictionary', '{"word":"helicopter","category":"objects","difficulty":1}'::jsonb, 'objects', 1, 'cbde83173a31f4f2f91fcae119db922613c2e1809dabed7e6c6d874dd18d57d8'),
('pictionary', '{"word":"rollercoaster","category":"objects","difficulty":2}'::jsonb, 'objects', 2, '586fc97a344b20db2e0bd5204a6f11a3042a6ba60cc4847f39922c7ee78bc889'),
('pictionary', '{"word":"windmill","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '884a339b96f4273d9ca4dd40bec0ef67491e64f6a03f475cacb3325dfe372017'),
('pictionary', '{"word":"lighthouse","category":"objects","difficulty":1}'::jsonb, 'objects', 1, 'b370de14e94142d4a108a79df6d0e265a0ba3fa2e10f57c4b3a892b74c9f84aa'),
('pictionary', '{"word":"hot air balloon","category":"objects","difficulty":2}'::jsonb, 'objects', 2, '24d067014ad55db93836073d73a06c364209c7ed1f6a7a2f7441c916566a7df2'),
('pictionary', '{"word":"traffic light","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '34d7399635770491c7398319493a035f88486b2458467b784ff2065939a83a8b'),
('pictionary', '{"word":"scissors","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '493a15e7bda88b07272071cbcfd3cb05920b999872b6f3cfa6e4d16712dbf434'),
('pictionary', '{"word":"alarm clock","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '26869f79615bd71cd6c58d1e02d66310eb1e3e72d62092c42d0f5236d6cc9d3b'),
('pictionary', '{"word":"lightbulb","category":"objects","difficulty":1}'::jsonb, 'objects', 1, 'beed9cd9613ee690c73dc1cc968064d8387cd42385694a4ddb22d09615921ab0'),
('pictionary', '{"word":"headphones","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '86d6e84ef9a21b74c964a209d4ee7ace5e73d1723bb0f0b665c39b0b073fb04c'),
('pictionary', '{"word":"sunglasses","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '754ee0c9fc2cd559bc425b8c4287a474bc68e77d968b21387edbed66e2a2433b'),
('pictionary', '{"word":"backpack","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '5f00368a6ad231c3c439c4f6bc33c27014b4d35a904ff1656d74f9528636f496'),
('pictionary', '{"word":"guitar","category":"objects","difficulty":1}'::jsonb, 'objects', 1, 'd081f5e402980b267f1f87cb6b74fc3eb249de26e670a9db55dec67da7864de4'),
('pictionary', '{"word":"camera","category":"objects","difficulty":1}'::jsonb, 'objects', 1, '89e8b9518d92279489bbdee26f3dc646d921d89a15afbd3a3e0ad695328a3da0'),
('pictionary', '{"word":"trophy","category":"objects","difficulty":1}'::jsonb, 'objects', 1, 'b39419ef79491b8efa0ae699a656fd976430fc16a7917f5bfcc9ce8fc6a8eff2'),
('pictionary', '{"word":"treasure chest","category":"objects","difficulty":2}'::jsonb, 'objects', 2, '300886b285c4b88e4fcb5539443fccf4abd90db95a0b3eeef64178df2f513b8a'),
('pictionary', '{"word":"boombox","category":"objects","difficulty":2}'::jsonb, 'objects', 2, '43f3f1514bd5c8021608905e38dd17e559a3901f5aa7de0e1cfd629c408b0ab5'),
('pictionary', '{"word":"snow globe","category":"objects","difficulty":2}'::jsonb, 'objects', 2, '087d4ae078e7212f3fd20ecf9a2d74df49251ea5b2ed07fbf06fdf42dd56a058'),
('pictionary', '{"word":"campfire","category":"objects","difficulty":1}'::jsonb, 'objects', 1, 'fa51a8398d307c5ef4bf94c059cb7b8b75c7f696fb14c8b505367ff15fbf887f'),
('pictionary', '{"word":"boomerang","category":"objects","difficulty":2}'::jsonb, 'objects', 2, 'cb8689619bad91d58e16aa46b96784926360bd186e7dc738822fab2973043a0d'),
('pictionary', '{"word":"whiteboard","category":"office","difficulty":1}'::jsonb, 'office', 1, '8460e24969d53e382b52b1caebde8dc491de69e7f4f6924c95c2eb6101822810'),
('pictionary', '{"word":"stapler","category":"office","difficulty":1}'::jsonb, 'office', 1, '6247f77181245a32148fcd4222f20d8a90ddba06a8a3d3db5c8a2a5efa940719'),
('pictionary', '{"word":"paperclip","category":"office","difficulty":1}'::jsonb, 'office', 1, '670d47ccb9a6cdef180e87d03ef6a3b783c771ecac19fb76c3ba5551ab369da8'),
('pictionary', '{"word":"coffee mug","category":"office","difficulty":1}'::jsonb, 'office', 1, '5e94977492fade422993784d63d359a4e6c6744d513c90399b0f0a20e4d1e9ac'),
('pictionary', '{"word":"water cooler","category":"office","difficulty":1}'::jsonb, 'office', 1, 'ff66498fe3b6116ddaae7c32e2118ce57abda4fa715d960c10398458fa178779'),
('pictionary', '{"word":"laptop","category":"office","difficulty":1}'::jsonb, 'office', 1, '5eec0dc419aa8337bf725f026fda9c78c1cb1c642eeaff9d6e1112f37783e942'),
('pictionary', '{"word":"swivel chair","category":"office","difficulty":2}'::jsonb, 'office', 2, '24617e763d8944f429dc7cefbf2d392d760cdd4e2bd87b9c7da096aaebd90d29'),
('pictionary', '{"word":"shredder","category":"office","difficulty":2}'::jsonb, 'office', 2, 'a0985e8650bb22286e0a3625b9af347ffde177e7850b177fb7879d8c61aa727e'),
('pictionary', '{"word":"sticky note","category":"office","difficulty":1}'::jsonb, 'office', 1, '51016cb04be689f257f1c71edc589f6286abee0fb8b0b611725f34ff5b96dd51'),
('pictionary', '{"word":"highlighter","category":"office","difficulty":1}'::jsonb, 'office', 1, 'cf42b9f7565299fb259b5457e8e14c66afaa15f39cf7de7cad51d4999b6e7248'),
('pictionary', '{"word":"projector","category":"office","difficulty":2}'::jsonb, 'office', 2, '0f12166cd5d87ffdea9fac1f51ec96cb283f95e1e6b6dc35e14e15f2bad2ff69'),
('pictionary', '{"word":"briefcase","category":"office","difficulty":1}'::jsonb, 'office', 1, '645274c37697db3f009b17b5d2ff88437f6b63089618d39d424c6998088151da'),
('pictionary', '{"word":"filing cabinet","category":"office","difficulty":2}'::jsonb, 'office', 2, '4cab42aa60b9b0d3350d4737dd10968334188de29278d581d5040f3a46f2cafc'),
('pictionary', '{"word":"badge","category":"office","difficulty":1}'::jsonb, 'office', 1, '8805cdea2b197df5fd555dc359a7f5beed2e6d65de498ce3df3de94d78e1e262'),
('pictionary', '{"word":"printer","category":"office","difficulty":1}'::jsonb, 'office', 1, 'ba70e1dacc17e1a77072ce9705bcbe3bc0063b5792d590f20eefdcd3d876daee'),
('pictionary', '{"word":"headset","category":"office","difficulty":1}'::jsonb, 'office', 1, 'df31ce5aab9e6548dce8c6e6ee47fdc5c6d1836dd85359c08e8798a5507610b4'),
('pictionary', '{"word":"keyboard","category":"office","difficulty":1}'::jsonb, 'office', 1, '91f060a9ad4b39eb228d9537292fab19d252faed06c169d0fdcb4a90560f5676'),
('pictionary', '{"word":"mousepad","category":"office","difficulty":1}'::jsonb, 'office', 1, '5d727182194a8de0a061fa007e3b8fd7b480b3d5f17bbafeaa9e11490bbf95c9'),
('pictionary', '{"word":"calculator","category":"office","difficulty":1}'::jsonb, 'office', 1, 'd2d4a592700b0920658e5d56ed50ebfaa82b1f4a3e105e9bcfd8bcbb081c2e87'),
('pictionary', '{"word":"id card","category":"office","difficulty":1}'::jsonb, 'office', 1, '566ff5e30864db914c42e3474da03612eda45c2df93c91dab3b5cbfa9964b44b'),
('pictionary', '{"word":"pie chart","category":"office","difficulty":1}'::jsonb, 'office', 1, 'f78aabb5462595d028130a1af44f33177a6d46915086fa531d8408259e249cea'),
('pictionary', '{"word":"podium","category":"office","difficulty":2}'::jsonb, 'office', 2, '34b7a4cccd0535509c1ab8b3452cec1cb2337f8a26994565fd3613420243f022'),
('pictionary', '{"word":"trash can","category":"office","difficulty":1}'::jsonb, 'office', 1, '9780f4d76d8a55d3cf6e3c8cedb651aa6ed7d2f448c2cb6b517b30a2d573fc2c'),
('pictionary', '{"word":"desk plant","category":"office","difficulty":1}'::jsonb, 'office', 1, '4617dd7b84f12bfaab5894bd2afbc96484026d3bdfe1878b716cae91fc3ace11'),
('pictionary', '{"word":"elevator","category":"office","difficulty":2}'::jsonb, 'office', 2, '41762bcf88c5e7148181df374b2e9ecff9bc9e64d67e032ebeea1a6d5a26eda8'),
('pictionary', '{"word":"pizza slice","category":"food","difficulty":1}'::jsonb, 'food', 1, '7e32bf0650b143f3609275ff2f1df3d8424c689e22658a9d121f2af0e5210811'),
('pictionary', '{"word":"hamburger","category":"food","difficulty":1}'::jsonb, 'food', 1, 'cc86d865e47a25af4b8fdad267e28c30a604f728e73ee22d2fb55b4e7a92ce96'),
('pictionary', '{"word":"ice cream cone","category":"food","difficulty":1}'::jsonb, 'food', 1, 'a074851e375da53f74351de1a5eef8953ccb980a6dbfb9b03b1eb1b8776f5050'),
('pictionary', '{"word":"cupcake","category":"food","difficulty":1}'::jsonb, 'food', 1, 'b0eaeafbf3fadbe6d70268e131724ec7421ffc3d18653e2fb33a7db10e70ac83'),
('pictionary', '{"word":"taco","category":"food","difficulty":1}'::jsonb, 'food', 1, '07c05679b1cfed895de0d8383a02cafb7a040d5db41878fa2c47103fe7aba541'),
('pictionary', '{"word":"watermelon","category":"food","difficulty":1}'::jsonb, 'food', 1, '31a2d5282683edb3a22c565f199aa96fb9ffb3107af35aad92ee1cd567cfc25d'),
('pictionary', '{"word":"sushi roll","category":"food","difficulty":2}'::jsonb, 'food', 2, '87cada9f5b815f9c0d83a7b949c259ec21499299f6f3f2ecfce3137298694c4f'),
('pictionary', '{"word":"popcorn","category":"food","difficulty":1}'::jsonb, 'food', 1, '0a4ef253e3fef22cb9d3bc5280386f9f2d1cf351da6582d8254659d1b27ea0b3'),
('pictionary', '{"word":"donut","category":"food","difficulty":1}'::jsonb, 'food', 1, '2f63371bea3c61d9fdba4469984bd22f2cc2381d23e031634f0387bdd97bd28f'),
('pictionary', '{"word":"croissant","category":"food","difficulty":2}'::jsonb, 'food', 2, 'fbb1eeb89d064f2680346a80fc5c249bde3f73179ebd955b226aadf6d9abec7b'),
('pictionary', '{"word":"avocado","category":"food","difficulty":1}'::jsonb, 'food', 1, 'f9c9baac9006160a6d84a09e77cbfeac349c861513e1786ea447e00198068e20'),
('pictionary', '{"word":"pineapple","category":"food","difficulty":1}'::jsonb, 'food', 1, 'b0fef621727ff82a7d334d9f1f047dc662ed0e27e05aa8fd1aefd19b0fff312c'),
('pictionary', '{"word":"hot dog","category":"food","difficulty":1}'::jsonb, 'food', 1, '836cef5d66db4134a43292efbdedae523b209efe7afefce8679893b4142b27c0'),
('pictionary', '{"word":"pretzel","category":"food","difficulty":2}'::jsonb, 'food', 2, 'd1fedacd123d970fe92b965786e25503fe5a1f3f5c6938889d16847c106d7666'),
('pictionary', '{"word":"pancake stack","category":"food","difficulty":2}'::jsonb, 'food', 2, 'b635fd4f1ed4212c0a54cf53a805959b90fc48cb915494c2927f09bbbcd3cf10'),
('pictionary', '{"word":"strawberry","category":"food","difficulty":1}'::jsonb, 'food', 1, '5e737f891db1175442a39fde73e51d781a545506d71c95477a6deb5988bd7f9a'),
('pictionary', '{"word":"french fries","category":"food","difficulty":1}'::jsonb, 'food', 1, 'fbeef318a1174982194a64bb35be1d47dccaa04e99e3b29ec2251ef1c8900c5b'),
('pictionary', '{"word":"lollipop","category":"food","difficulty":1}'::jsonb, 'food', 1, '07307784035fdc5cb2e003cb3d905a4782d034858b6a4699bf26c9804a378cae'),
('pictionary', '{"word":"boba tea","category":"food","difficulty":2}'::jsonb, 'food', 2, '1944261fc3eda584146a17615c660e7fcc0e14ff2983e0ac904bc99fc860f500'),
('pictionary', '{"word":"chocolate bar","category":"food","difficulty":1}'::jsonb, 'food', 1, '7a4aa8cdcc74f1e4b6820b5c7595a9601b4669e6be343c4b988c1d26cfa954ed'),
('pictionary', '{"word":"spaghetti","category":"food","difficulty":2}'::jsonb, 'food', 2, '9b4c539948ae24d8c7f3efad2bb6c1665a8d9bae8eec600f286247e1d98acafc'),
('pictionary', '{"word":"coconut","category":"food","difficulty":1}'::jsonb, 'food', 1, '23ebce72c4424e81ef48a495bc9ca88c93b8a34ab398bed854b76f1c784ab227'),
('pictionary', '{"word":"mushroom","category":"food","difficulty":1}'::jsonb, 'food', 1, '5ef2c394d5b63e4175cd331c74c8453c3e36eb8f47f6d648397ff6c1314fd705'),
('pictionary', '{"word":"sandwich","category":"food","difficulty":1}'::jsonb, 'food', 1, '8f5c570f55dd7921c9861e941be98a9492991d1a862d05283f6ddad56c891cca'),
('pictionary', '{"word":"cheese wedge","category":"food","difficulty":1}'::jsonb, 'food', 1, '38147ba43a14b9aedf853bc552acad35c51d5ab7ac1797cf830196569bd44ede'),
('pictionary', '{"word":"volcano","category":"nature","difficulty":1}'::jsonb, 'nature', 1, '06612c2832341c9e69c890d3dea465f8baede4895cad1e5ab22c7f513ab5758d'),
('pictionary', '{"word":"waterfall","category":"nature","difficulty":1}'::jsonb, 'nature', 1, '3cb562c897155ca6e376e1df492d7bd0c09a09a7fd20a632b6ea1092837d1952'),
('pictionary', '{"word":"rainbow","category":"nature","difficulty":1}'::jsonb, 'nature', 1, '8fced00b6ce281456d69daef5f2b33eaf1a4a29b5923ebe5f1f2c54f5886c7a3'),
('pictionary', '{"word":"crescent moon","category":"nature","difficulty":1}'::jsonb, 'nature', 1, 'c5b7b970614ea026e5653e0edb016480f77141e49877e646210b2d11806bde71'),
('pictionary', '{"word":"lightning bolt","category":"nature","difficulty":1}'::jsonb, 'nature', 1, 'ba84bc221570650adf0427cf675640c462a359c3fdc76e4b0e9d89e6929e5de0'),
('pictionary', '{"word":"island","category":"nature","difficulty":1}'::jsonb, 'nature', 1, '28cd2c5c15d13978a6bc06d38092dbbafb31f5590aa3ac120f9f8d8c0e0708c4'),
('pictionary', '{"word":"iceberg","category":"nature","difficulty":1}'::jsonb, 'nature', 1, '3df2151b4a7a502b64c48670c9b276cd1a5008f09c5864bb902ef38626e5ddba'),
('pictionary', '{"word":"cactus","category":"nature","difficulty":1}'::jsonb, 'nature', 1, 'caaeac3184e90c7f8587d692f03105bfe111982ab663ed6c6e1d0237eb3420f2'),
('pictionary', '{"word":"sunflower","category":"nature","difficulty":1}'::jsonb, 'nature', 1, '8f398886c326b5f8f07b20ac250c87de6723e062474465273fe1524f2b9092fa'),
('pictionary', '{"word":"palm tree","category":"nature","difficulty":1}'::jsonb, 'nature', 1, 'b743c777c86c5b592873c3f2abd98b8b80f005784dd4af558f20d530d262f56b'),
('pictionary', '{"word":"tornado","category":"nature","difficulty":2}'::jsonb, 'nature', 2, '83716a35515f728928d7ce0aaa73e3445679d939169124b88fec90b522c45179'),
('pictionary', '{"word":"cave","category":"nature","difficulty":2}'::jsonb, 'nature', 2, 'b89a199ea81b6a925de700d15ccecdd9a0d7b9df2643a65f1b6f59af57a2c99d'),
('pictionary', '{"word":"pyramid","category":"places","difficulty":1}'::jsonb, 'places', 1, '22ba2d6f2848f4c040f5721ad15349dc5851fdc7d8b2973d45706afffbedc25e'),
('pictionary', '{"word":"castle","category":"places","difficulty":1}'::jsonb, 'places', 1, '913a53d7df2fad651bed414afb045378c3495b23d5174bead8091dcc8cdef8ff'),
('pictionary', '{"word":"bridge","category":"places","difficulty":1}'::jsonb, 'places', 1, '17f29b073143d8cd97b5bbe492bdeffec1c5fee55cc1fe2112c8b9335f8b6121'),
('pictionary', '{"word":"igloo","category":"places","difficulty":1}'::jsonb, 'places', 1, '01b1539b30a2d85b25b95ec506a65dc894a94b5c5c60dc14d8c968a5a88e6aee'),
('pictionary', '{"word":"tent","category":"places","difficulty":1}'::jsonb, 'places', 1, '2a9810cb71316c9a03e5d27d69bb61f3e2254ba3c763b453702aeb47fd8f8d89'),
('pictionary', '{"word":"barn","category":"places","difficulty":1}'::jsonb, 'places', 1, 'e43a7ece3a362be44a9eadddd66fc927b8d592c22060595b5b2d2e20cbd22be9'),
('pictionary', '{"word":"space station","category":"places","difficulty":3}'::jsonb, 'places', 3, '5be3467b5bd8b60099ac265f447b3637b36adb565452ad9852bc38a9ce09f903'),
('pictionary', '{"word":"stadium","category":"places","difficulty":2}'::jsonb, 'places', 2, 'dafc4889ee011aab244b6ed27809b0ae4e1b5da1c8952c5f1cfa66700a596ccb'),
('pictionary', '{"word":"airport","category":"places","difficulty":2}'::jsonb, 'places', 2, 'ccc9ff052aee8da1c7d607bee2283e981bd0bdce2de409fe3789ada64e20e080'),
('pictionary', '{"word":"amusement park","category":"places","difficulty":3}'::jsonb, 'places', 3, '97214675c87ccef1f0a6b97787ca5b202cfb0fc8793dd3431419c70126b64d22'),
('pictionary', '{"word":"treehouse","category":"places","difficulty":2}'::jsonb, 'places', 2, 'dc12c22f0cab5fd6943c2870d9b8eaf55902c02ced0519a66cdb96bc47ac698a'),
('pictionary', '{"word":"desert","category":"places","difficulty":2}'::jsonb, 'places', 2, '237ab3365842e475721a65d4a2a2623b2c4b24bf063cbfdc7c78dde01f95df93'),
('pictionary', '{"word":"monument","category":"places","difficulty":2}'::jsonb, 'places', 2, '6c58160fe1935610171c4ef8e12c2fcb96cbb168db852a927e968b8dda7b0e11'),
('pictionary', '{"word":"swimming","category":"actions","difficulty":1}'::jsonb, 'actions', 1, '7aab06cd90b6efabfbc581922a4ad2ddfba2a20a0be4120eb5d0e5e72a59df66'),
('pictionary', '{"word":"skating","category":"actions","difficulty":1}'::jsonb, 'actions', 1, 'b8aa64f3ccf3ebb75cd3f26086d9a9fa352235f521f969e51502194ad8e17dd2'),
('pictionary', '{"word":"fishing","category":"actions","difficulty":1}'::jsonb, 'actions', 1, 'b0120ab459558f30fb7d0d98d4bd29a8131505f13eaa4b584ec91244d09cbde2'),
('pictionary', '{"word":"sleeping","category":"actions","difficulty":1}'::jsonb, 'actions', 1, '546f04bb7ac096c418d0b3d7b933d20e46dc7608024ff2b0cdf86f0f206fd6f9'),
('pictionary', '{"word":"cooking","category":"actions","difficulty":1}'::jsonb, 'actions', 1, '82bd81ea4b0302554165ae91628c0965b68b976a62ecf107c2e79688833f7599'),
('pictionary', '{"word":"dancing","category":"actions","difficulty":1}'::jsonb, 'actions', 1, '68d6641ff9421a6a305e56d4f1f79c1d426c977a1bcd3cadcd0d337ee4a6d323'),
('pictionary', '{"word":"singing","category":"actions","difficulty":1}'::jsonb, 'actions', 1, 'd0112b0319f68c7a04ae5409dd4d98501db2b32aff9e752d73071f49e30bbbd1'),
('pictionary', '{"word":"sneezing","category":"actions","difficulty":2}'::jsonb, 'actions', 2, '494b98a7f355e1a4418edb43965e4a98d1e629d4989a246e28ee1636f9b2fd87'),
('pictionary', '{"word":"juggling","category":"actions","difficulty":2}'::jsonb, 'actions', 2, '4527031e5b27fee382a53acd9445bce9f0abf220e166ff316b388051e8a1573f'),
('pictionary', '{"word":"yawning","category":"actions","difficulty":2}'::jsonb, 'actions', 2, 'a57677c454ace81aba6985c2d6e412369805ced6652d53d574e0292df053cd62'),
('pictionary', '{"word":"climbing","category":"actions","difficulty":2}'::jsonb, 'actions', 2, 'df7da510a6fe1ab64a57e49687b9b1d239e647850ecb7ba49b542df06a591d11'),
('pictionary', '{"word":"meditating","category":"actions","difficulty":2}'::jsonb, 'actions', 2, 'a6fa3a04544b676f0ac2364c2c1e2a6e35cec0712b0f78037cc97310b65aee76'),
('pictionary', '{"word":"whispering","category":"actions","difficulty":3}'::jsonb, 'actions', 3, '4822284397a3de29b34481d100bc8ac363816263d9489901bf90cb9fa68b0fc3'),
('pictionary', '{"word":"typing","category":"actions","difficulty":1}'::jsonb, 'actions', 1, 'f8fd8e84e5d029290a7de562095cd9d86a6e7fdfec86d76e007ceefb676c5b0a'),
('pictionary', '{"word":"laughing","category":"actions","difficulty":1}'::jsonb, 'actions', 1, '3f901602db02e2515a55dcecb094a522d71ed5e27d1565d8967cfbf64b44156f'),
('pictionary', '{"word":"running","category":"actions","difficulty":1}'::jsonb, 'actions', 1, 'c071cf5f5ed6f884cc70155b6f05f755fd46a302d05e4261b7e92ce878bbfed8'),
('pictionary', '{"word":"flying","category":"actions","difficulty":1}'::jsonb, 'actions', 1, 'a1f95e4f6e5e4d17aafbe143c1357c9923e0854d74938aa75e89e836ef1ce077'),
('pictionary', '{"word":"crying","category":"actions","difficulty":1}'::jsonb, 'actions', 1, 'e94d1a2b79c376cca3e02a7e661902d37438d150f07b3afc545014e93bf2660c'),
('pictionary', '{"word":"surfing","category":"actions","difficulty":1}'::jsonb, 'actions', 1, '6bbed1b598cd62c008c238f05be1e5b5ae5caf07255352dcf63ea3e34c2aab32'),
('pictionary', '{"word":"painting","category":"actions","difficulty":1}'::jsonb, 'actions', 1, 'a54e5638bbc34d80ddd34634760fe0db2bbbb301bc97675112c21df61eefdb63'),
('charades', '{"prompt":"Finding Nemo","category":"movies","difficulty":1,"hint":"2 words (Movie)"}'::jsonb, 'movies', 1, 'e7a61ba423f6be8e6275d46cb184c7734d36e95aaa380ee20c6b983ba7159a18'),
('charades', '{"prompt":"The Lion King","category":"movies","difficulty":1,"hint":"3 words (Movie)"}'::jsonb, 'movies', 1, 'f590f76789760b9e4556e036040162e10cac69977cff57a7ad6539009cbd00e2'),
('charades', '{"prompt":"Spider Man","category":"movies","difficulty":1,"hint":"2 words (Movie)"}'::jsonb, 'movies', 1, '31997aef76056cbfed98fd7b65288a6560d1179d97cbaadb73ba267f1ba254fa'),
('charades', '{"prompt":"Jurassic Park","category":"movies","difficulty":1,"hint":"2 words (Movie)"}'::jsonb, 'movies', 1, '2894942de7267b55ba616e5f72fb2c507f613d845cbd3ad66cb74a8af443bce2'),
('charades', '{"prompt":"Up","category":"movies","difficulty":1,"hint":"1 word (Movie)"}'::jsonb, 'movies', 1, '75a288c0d6898c5f7b054590845978a82a3ad79fcce3d43ff68a7501e5a91ee9'),
('charades', '{"prompt":"Titanic","category":"movies","difficulty":1,"hint":"1 word (Movie)"}'::jsonb, 'movies', 1, '8c2a25260209b2db50e9d7c369876ddeeaebde2472a38426ca4907fbe4135921'),
('charades', '{"prompt":"Frozen","category":"movies","difficulty":1,"hint":"1 word (Movie)"}'::jsonb, 'movies', 1, 'ffb304816a1090313e833215c08dae3d209cfad1ffd1f674f0909a2ae99e1394'),
('charades', '{"prompt":"Star Wars","category":"movies","difficulty":1,"hint":"2 words (Movie)"}'::jsonb, 'movies', 1, '6efced6a7e04d1137ae7e833b91a4b7660fc985091525eae5bf656819a7f31f9'),
('charades', '{"prompt":"Harry Potter","category":"movies","difficulty":1,"hint":"2 words (Movie)"}'::jsonb, 'movies', 1, 'f2e5d762060797916b7d886ca149b16e14117f8553d5bab5487d5ed5a8fabb81'),
('charades', '{"prompt":"Toy Story","category":"movies","difficulty":1,"hint":"2 words (Movie)"}'::jsonb, 'movies', 1, '92343e8e0cf2f5931895a2a0718e4770699396a91dd80a62f982c50901380bed'),
('charades', '{"prompt":"Home Alone","category":"movies","difficulty":1,"hint":"2 words (Movie)"}'::jsonb, 'movies', 1, 'a5792dc70400354a79c02d390424ed0011683f6feca9cdf2abbe9170f8abc417'),
('charades', '{"prompt":"Pirates of Caribbean","category":"movies","difficulty":2,"hint":"3 words (Movie)"}'::jsonb, 'movies', 2, '8b81d57acaf9d55bc54c3e2101634750e86d7a016308fc9b99dd062e87ea6822'),
('charades', '{"prompt":"Ratatouille","category":"movies","difficulty":2,"hint":"1 word (Movie)"}'::jsonb, 'movies', 2, '7011b12039b74a2748da225c9ee568e8fda4ff9771dce6b36b1950557e3f8d3c'),
('charades', '{"prompt":"Matrix","category":"movies","difficulty":2,"hint":"1 word (Movie)"}'::jsonb, 'movies', 2, '6e00cd562cc2d88e238dfb81d9439de7ec843ee9d0c9879d549cb1436786f975'),
('charades', '{"prompt":"Avatar","category":"movies","difficulty":1,"hint":"1 word (Movie)"}'::jsonb, 'movies', 1, '87bbe879c7a5f5784a70384bb49fa9513a6a3fbe4c2d388635e3c87611c03fae'),
('charades', '{"prompt":"Ghostbusters","category":"movies","difficulty":1,"hint":"1 word (Movie)"}'::jsonb, 'movies', 1, 'a76792a4c64af0b02bf69a52dea9371bcdf14ff7fe1b3d1eb09cfc95579659f2'),
('charades', '{"prompt":"Men in Black","category":"movies","difficulty":1,"hint":"3 words (Movie)"}'::jsonb, 'movies', 1, '8dcd10682c49b8508a4c099368be6a89bc1fc3c1c515eda730b95e9988be95cc'),
('charades', '{"prompt":"Back to Future","category":"movies","difficulty":2,"hint":"3 words (Movie)"}'::jsonb, 'movies', 2, '74c9956cf035c7091a94f1656d68c41ef24d7eac4ed4230b5a7455bb9fe8f19e'),
('charades', '{"prompt":"Shrek","category":"movies","difficulty":1,"hint":"1 word (Movie)"}'::jsonb, 'movies', 1, '73ab5b27de35a0f57fab24b423f85d08f6671b252d5e0106ac9f0097dc09d13d'),
('charades', '{"prompt":"The Dark Knight","category":"movies","difficulty":2,"hint":"3 words (Movie)"}'::jsonb, 'movies', 2, 'f093d732a3b250b17866bc7b4163920f7907c2cb982dd10f727330c63935317a'),
('charades', '{"prompt":"Work from home","category":"office","difficulty":1,"hint":"3 words (Office)"}'::jsonb, 'office', 1, 'b9d5868a1f15f14629bb1006a74edf90c1ea6df82b9614d4faadefc4d6061ade'),
('charades', '{"prompt":"You are on mute","category":"office","difficulty":1,"hint":"4 words (Office)"}'::jsonb, 'office', 1, '579c1ba2639af31191620c0d5af72f6f8429d8de579e37a6ca9a0ee31138f229'),
('charades', '{"prompt":"Coffee break","category":"office","difficulty":1,"hint":"2 words (Office)"}'::jsonb, 'office', 1, 'dbc1c0f49195384a794a1360d60b9cad7f0f4a0595a53b8be857918cdbbc04eb'),
('charades', '{"prompt":"Happy hour","category":"office","difficulty":1,"hint":"2 words (Office)"}'::jsonb, 'office', 1, '9dd9996bced1f3a96bdfe33f7e5c99675469ca68f715ce6a525866b105524f54'),
('charades', '{"prompt":"Reply all","category":"office","difficulty":1,"hint":"2 words (Office)"}'::jsonb, 'office', 1, 'b86721c5f114a6ec47ee4138d48f64ecf3817f836414ba7daf0021c8ac4761eb'),
('charades', '{"prompt":"Brainstorming","category":"office","difficulty":1,"hint":"1 word (Office)"}'::jsonb, 'office', 1, 'bf4851838b32700498159d1f2bff276d3a08d01e24c146b38f8867aa8c70f95a'),
('charades', '{"prompt":"Deadline tomorrow","category":"office","difficulty":2,"hint":"2 words (Office)"}'::jsonb, 'office', 2, 'f496aef340c357f6a1c601bc2bfaddc84645cd876193069c41d9dd5bec151fc1'),
('charades', '{"prompt":"PowerPoint presentation","category":"office","difficulty":2,"hint":"2 words (Office)"}'::jsonb, 'office', 2, 'e0625ac5ae282f971b8d3ef5a91101ca22495c837f86afa846b8c6459b4cb653'),
('charades', '{"prompt":"Water cooler gossip","category":"office","difficulty":2,"hint":"3 words (Office)"}'::jsonb, 'office', 2, 'be4af85fae4d8757fc37ddbdcac998d2ec0d2119d14c118cc488a67d1a12eb54'),
('charades', '{"prompt":"Meeting could be email","category":"office","difficulty":2,"hint":"4 words (Office)"}'::jsonb, 'office', 2, '9118ae4d273e0b3f9d02965e027b1317e9e0b8cb06e55f0ae69109566638d137'),
('charades', '{"prompt":"Team lunch","category":"office","difficulty":1,"hint":"2 words (Office)"}'::jsonb, 'office', 1, '7cba770bed4a87106bae95438eb573f51eea468b5e3f16b963c3ef55a447b995'),
('charades', '{"prompt":"Friday feeling","category":"office","difficulty":1,"hint":"2 words (Office)"}'::jsonb, 'office', 1, '7e7102d790c41b3023589bb0949c08868190225ad3e30bd19aecc707c50686ec'),
('charades', '{"prompt":"Spreadsheet crash","category":"office","difficulty":2,"hint":"2 words (Office)"}'::jsonb, 'office', 2, '25a77b74ea7c0905ca41f30f5843721fb708da5f1d4579697a1808c2e461741a'),
('charades', '{"prompt":"Printer paper jam","category":"office","difficulty":2,"hint":"3 words (Office)"}'::jsonb, 'office', 2, '7589d44c65c866aa919074560467c5e75674538a55db991d701329ca59bb1c18'),
('charades', '{"prompt":"Performance review","category":"office","difficulty":2,"hint":"2 words (Office)"}'::jsonb, 'office', 2, '87c0c74a964c9b659cf8a9d58bac885a21882fac7a3436ebc1933e45a89cdda0'),
('charades', '{"prompt":"Monday morning blues","category":"office","difficulty":2,"hint":"3 words (Office)"}'::jsonb, 'office', 2, 'd4b563db8bee8c61ba8161e04718d9778b0fdb3e47198ed27368285363099f00'),
('charades', '{"prompt":"Promotion celebration","category":"office","difficulty":2,"hint":"2 words (Office)"}'::jsonb, 'office', 2, '526240a9ba4ffe342023af5baafea371fd3d8c00259ac286ea5a096e9af88e67'),
('charades', '{"prompt":"Secret Santa","category":"office","difficulty":1,"hint":"2 words (Office)"}'::jsonb, 'office', 1, 'd6a10f1fd623b4ba7e9c8552b654dee47cb2195583132d95e0e54ff97661c585'),
('charades', '{"prompt":"Office birthday cake","category":"office","difficulty":1,"hint":"3 words (Office)"}'::jsonb, 'office', 1, 'ff09265ba78d99e1371f8565b6e9aec56530d5fbc77627379c05e9227f7f4dce'),
('charades', '{"prompt":"Wifi is down","category":"office","difficulty":1,"hint":"3 words (Office)"}'::jsonb, 'office', 1, '3dc123ad440662eeda3552d7ce7f62b1eeb620ecd54eb2a4292eed26fcb940fc'),
('charades', '{"prompt":"Time is money","category":"phrases","difficulty":1,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 1, '18bd3503430643b4ee2161bca96513b22a2fe0b9c296d7101178da78dee74864'),
('charades', '{"prompt":"Piece of cake","category":"phrases","difficulty":1,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 1, 'bb21d4af2d32d56cf75522f465b6a12fa0d13b72f3c3df26a42d53652a17da08'),
('charades', '{"prompt":"Spill the tea","category":"phrases","difficulty":1,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 1, '00aa88240d48e8af6d9d706d76a670e795998365251c73022396fe0fbf09c064'),
('charades', '{"prompt":"Break a leg","category":"phrases","difficulty":1,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 1, '6953d9d2c93861f11ed71be1f93ea3c72c1f06eea47ae82220c29bac852afaec'),
('charades', '{"prompt":"Bite the bullet","category":"phrases","difficulty":2,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 2, '35a76c047e9a69bdfc003f9cd714a85078282e95c5b96c37538189a0225af451'),
('charades', '{"prompt":"Cat got your tongue","category":"phrases","difficulty":2,"hint":"4 words (Phrase)"}'::jsonb, 'phrases', 2, '900738a1390206e7f2b91e8970efa8b373f4460dbf50018fa97f2236859f92d5'),
('charades', '{"prompt":"Cry me a river","category":"phrases","difficulty":1,"hint":"4 words (Phrase)"}'::jsonb, 'phrases', 1, 'dbc9c2632570a52763403a908b29b3c98a84ed1f80b9958542673154900246f2'),
('charades', '{"prompt":"Under the weather","category":"phrases","difficulty":2,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 2, '618603a2283a1d06c5d074e17ffd45fe66815a74513d8bd5a2e50d2da24ddcb9'),
('charades', '{"prompt":"When pigs fly","category":"phrases","difficulty":1,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 1, '098543a97393acd3244c7f5e0ed63b703886f1e7e5a3a96ca38fd5bc4049df1c'),
('charades', '{"prompt":"Hold your horses","category":"phrases","difficulty":2,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 2, '6ea7a3b1952d53b3155becf446c344be32b2bb364d99dbda0fbafb7cd488752f'),
('charades', '{"prompt":"Butterflies in stomach","category":"phrases","difficulty":2,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 2, '2714323929f8c4d52e8bc1a4424763dd91ff823fe91f4d9499f73881cbd54079'),
('charades', '{"prompt":"Fish out of water","category":"phrases","difficulty":1,"hint":"4 words (Phrase)"}'::jsonb, 'phrases', 1, '7f82ab900b956b87c9b883aeafe2586d8733d83dd713e1f4be1c063889749dc2'),
('charades', '{"prompt":"Cold feet","category":"phrases","difficulty":1,"hint":"2 words (Phrase)"}'::jsonb, 'phrases', 1, '1a8d8ca5205505e8fc4bb7cbda7e13188b531e087dc8c6dcd8ffa35c327fd591'),
('charades', '{"prompt":"Heart of gold","category":"phrases","difficulty":1,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 1, '82f117a4c84faf8ab394fa369e6b01790b60f7aefddad4df58cb001e01324cbf'),
('charades', '{"prompt":"Raining cats and dogs","category":"phrases","difficulty":1,"hint":"4 words (Phrase)"}'::jsonb, 'phrases', 1, '1d03841d7e08f14d6b021260f253192c82319e24d5ded9d5a3b53bc3536f47cd'),
('charades', '{"prompt":"Walking on sunshine","category":"phrases","difficulty":2,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 2, '759ccb7cd4cb77c37e03db6d3f9d2e1ea1275a2dcd122f1968c582d50ef9f63e'),
('charades', '{"prompt":"Light bulb moment","category":"phrases","difficulty":1,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 1, '3736335e99a01e51f38c41ac0e3c1695f91c464c1eed22295f79d2052ef8c7fb'),
('charades', '{"prompt":"Sweet tooth","category":"phrases","difficulty":1,"hint":"2 words (Phrase)"}'::jsonb, 'phrases', 1, '4fc6706673151db909aad42932200d15f944f9a4daf5d3d45127b8ab52bb896a'),
('charades', '{"prompt":"Love at first sight","category":"phrases","difficulty":2,"hint":"4 words (Phrase)"}'::jsonb, 'phrases', 2, '01115b7ecee62a39f4d9025c002a391f4c3eeeb6bdbc0c8e883990f21330211c'),
('charades', '{"prompt":"Burning midnight oil","category":"phrases","difficulty":3,"hint":"3 words (Phrase)"}'::jsonb, 'phrases', 3, '4c55d24db9de327ec3a7d99bebb6e6416acf3772f9773b86f01064a826aecc1e'),
('charades', '{"prompt":"Beach vacation","category":"activities","difficulty":1,"hint":"2 words"}'::jsonb, 'activities', 1, '3b4e15c05a06402b46f6f660b3a7842618b67dc13cbfd397c2ddd0818617a8e6'),
('charades', '{"prompt":"Camping in woods","category":"activities","difficulty":1,"hint":"3 words"}'::jsonb, 'activities', 1, 'dffc92040d46813f3da3585f9b15a4da67544ab554053177c5c13c33a6ff3049'),
('charades', '{"prompt":"Karaoke night","category":"activities","difficulty":1,"hint":"2 words"}'::jsonb, 'activities', 1, '11f920ebc63a2e6eb529bb42466e649d30676dbb8526bc88da50f5e0cec9adce'),
('charades', '{"prompt":"Baking cookies","category":"activities","difficulty":1,"hint":"2 words"}'::jsonb, 'activities', 1, '418e96627a40d0d0fd22e09437f365d9cc1a7fb40133ef2ccd328aaf42dfe598'),
('charades', '{"prompt":"Playing video games","category":"activities","difficulty":1,"hint":"3 words"}'::jsonb, 'activities', 1, 'abc1d3832d48df33376ceeca801831dee2a42bc1c2b41bf7c5f72a109f4ac6a3'),
('charades', '{"prompt":"Walking the dog","category":"activities","difficulty":1,"hint":"3 words"}'::jsonb, 'activities', 1, '68252f5801b217ce69bca08ce3e6a72e0846a7d98ed984cec7228ed6140c89c9'),
('charades', '{"prompt":"Shopping spree","category":"activities","difficulty":1,"hint":"2 words"}'::jsonb, 'activities', 1, 'd2f0b0f81d8d0a2c9a14e809bb6cd4fd17ec02ffd4e6772849176fa4189ca425'),
('charades', '{"prompt":"Going to gym","category":"activities","difficulty":1,"hint":"3 words"}'::jsonb, 'activities', 1, '5e70f6f1abbf05a955d31ef0d8bcb99ba3006c658f51949ad10212caf3c78b8e'),
('charades', '{"prompt":"Watching horror movie","category":"activities","difficulty":2,"hint":"3 words"}'::jsonb, 'activities', 2, '34da29e500b5656feec6e169e1f314072bf7534ab68ebfc3d93fd0030a8e3b8b'),
('charades', '{"prompt":"Road trip","category":"activities","difficulty":1,"hint":"2 words"}'::jsonb, 'activities', 1, '1cf96799853b0fae73a1d971820a4e7665288891ce4ff3b37e558a85f1bf7b7f'),
('charades', '{"prompt":"New York City","category":"places","difficulty":1,"hint":"3 words (Place)"}'::jsonb, 'places', 1, '4a1bc98a833e2bd717cced2b82ec1f97f8c7a53d017d465a79ffa1f37eddad76'),
('charades', '{"prompt":"Paris France","category":"places","difficulty":1,"hint":"2 words (Place)"}'::jsonb, 'places', 1, 'f70e7012ddc05a6b6c5e7fce98e3663a4a08e7cf91cf7625b4b20bcc71d6d0a2'),
('charades', '{"prompt":"Taj Mahal","category":"places","difficulty":1,"hint":"2 words (Place)"}'::jsonb, 'places', 1, '8eb630308352991ab3c23347b3b1ca16b14e1a9f5ed73f19d051cb6fcc7fefbb'),
('charades', '{"prompt":"Haunted house","category":"places","difficulty":1,"hint":"2 words (Place)"}'::jsonb, 'places', 1, '2eb43f1ee2ecddcbb1c48b504f5ba03900a9738921fae67ea354428d0eb3af9e'),
('charades', '{"prompt":"Movie theater","category":"places","difficulty":1,"hint":"2 words (Place)"}'::jsonb, 'places', 1, 'f79aeb3b8985b11790ea1ceaeba4d2cfda7a3a19411c1330f14d65031020e23f'),
('charades', '{"prompt":"Supermarket rush","category":"places","difficulty":2,"hint":"2 words (Place)"}'::jsonb, 'places', 2, '2c38ccd9e6cc6b270a04414c4daaa65256c5d98a1d558e7c26154ff0248265ee'),
('charades', '{"prompt":"Airport security","category":"places","difficulty":2,"hint":"2 words (Place)"}'::jsonb, 'places', 2, 'f95d4ccf0e2c257bbc70f1082f07c1152c8e001805a7fe98ed46fb720f1fd005'),
('charades', '{"prompt":"Coffee shop","category":"places","difficulty":1,"hint":"2 words (Place)"}'::jsonb, 'places', 1, 'c798e5b18ed876efb8a937d27a0c48de53e3735e490e2116701901e369d8b7d9'),
('charades', '{"prompt":"Roller skate park","category":"places","difficulty":2,"hint":"3 words (Place)"}'::jsonb, 'places', 2, 'f1fd480c49b08ff9970f7b5ce665b2d3a6c880cb0573d522a1d94f542602bf91'),
('charades', '{"prompt":"Space rocket launch","category":"activities","difficulty":2,"hint":"3 words"}'::jsonb, 'activities', 2, '2bc98e4fba1e902cc8efe58774a5db9c11cd95f6441e6b0134f1d492d9612929'),
('typing', '{"text":"I hope this email finds you before I find another excuse to make a third cup of coffee before noon.","category":"humour","difficulty":1}'::jsonb, 'humour', 1, '22963912cdf7a567583c2cf5a8f1fb958d343d688c780aebdac19d65342faf96'),
('typing', '{"text":"Per my previous email, as discussed in the meeting that could have been a three sentence message on Slack.","category":"office","difficulty":1}'::jsonb, 'office', 1, '0806b3c415141e6e83e693f0eaf8c32160b2897093e792c87d7cc9b115df18d8'),
('typing', '{"text":"There are two types of people in this world: those who organize their desktop files, and pure chaotic geniuses.","category":"humour","difficulty":1}'::jsonb, 'humour', 1, '4cc7a3350e1dcf58e9e2d7db296ad9f66209b9c29fb3bc2c3a1dff6a37eeb375'),
('typing', '{"text":"My keyboard has seen more spilled coffee and frantic deadlines than a twenty-four hour diner counter on Friday night.","category":"humour","difficulty":1}'::jsonb, 'humour', 1, '6803a666f49af7fbcfa21498f5ca734a4a52a53e096eac2e073d19e2ca1b89e5'),
('typing', '{"text":"Please find attached the final version of the document, named Final_v2_really_final_approved_DO_NOT_EDIT.docx.","category":"office","difficulty":1}'::jsonb, 'office', 1, 'f276bf65ebd8b32a7d3c84e866b01c6d9cd1ef0258a59917607a3e2410cc5d32'),
('typing', '{"text":"A clean desk is a sign of a cluttered desk drawer where everything was shoved five minutes before the client arrived.","category":"humour","difficulty":1}'::jsonb, 'humour', 1, '54e202433a407704778bab6984d6561dd3744d6388be3e3c4ca45fe6657768f0'),
('typing', '{"text":"Nothing builds team camaraderie quite like mutually staring at a loading spinner during a high stakes screen share.","category":"office","difficulty":2}'::jsonb, 'office', 2, '7bd64328421f6162f92f1bf85dd5c48633f44685938fdc778d2635db0f3669e5'),
('typing', '{"text":"I am currently out of the office with no access to email, though we all know my phone is physically in my hand right now.","category":"office","difficulty":1}'::jsonb, 'office', 1, '93455122f566b62c840f335215983f4c71e8158e51fca6b07285e1b6a3513072'),
('typing', '{"text":"The code worked perfectly on my local machine. Physics simply changed when we deployed it to the production server.","category":"humour","difficulty":2}'::jsonb, 'humour', 2, '3d12e5fbf22c392563a1e73c3f07c3ba744a0a3e1243d8e11f62bec408d9defa'),
('typing', '{"text":"Let us circle back and touch base offline so we can synergize our core competencies before the next quarterly review.","category":"office","difficulty":2}'::jsonb, 'office', 2, '33dc94b10dd1b06d4a4a2de59ecaf1437b784da54d5de3ce0feac3160f90a6a6'),
('typing', '{"text":"The wifi went down for seven minutes today. In that brief window, I learned the names of three coworkers sitting nearby.","category":"humour","difficulty":1}'::jsonb, 'humour', 1, '8365d04c6c992e128ff7ad8e32a3b17c84786c1682e5841421cc1d13da399517'),
('typing', '{"text":"You can tell how important a meeting is by the quality of the snacks placed in the center of the conference room table.","category":"office","difficulty":1}'::jsonb, 'office', 1, '26177e3ce81ef0ebce9b60534a37b8bd4f060ef25e56d4a9fd788345f5ff176e'),
('typing', '{"text":"Always remember that you are absolutely unique, just like every single other person working across the open office floor.","category":"humour","difficulty":2}'::jsonb, 'humour', 2, '26f45d02e9c38ff6e987403bc9dd056142c50507b105cac19b7071bfb6def7d6'),
('typing', '{"text":"I started the week with great ambition and a color-coded task list. It is now Wednesday, and I am eating cold pizza.","category":"humour","difficulty":1}'::jsonb, 'humour', 1, 'eda3b2af7c64b6ba98c11a8c95678119c07199c5e64f9893251d3dc992b785de'),
('typing', '{"text":"If at first you do not succeed, call it version one point zero and schedule an urgent patch for next Tuesday morning.","category":"humour","difficulty":2}'::jsonb, 'humour', 2, '5ef105dc549066c166f5f7979625be32c917562ab15b561168fb9e335a204393'),
('typing', '{"text":"The mute button has saved more professional careers than ten years of dedicated leadership workshops combined.","category":"office","difficulty":1}'::jsonb, 'office', 1, '11b0d383d23f8b11f0886df03d5cd0846b5f4c9b8402e17c53490cfb204687ab'),
('typing', '{"text":"We need to pivot our strategy, disrupt the space, and optimize our bandwidth before the executive leadership call ends.","category":"office","difficulty":2}'::jsonb, 'office', 2, 'ddef24710f15667536bca4b60a1ab6e363312774f2e781d12c022752e014e08b'),
('typing', '{"text":"Legend says if you stare at an unread email long enough without typing a reply, it magically resolves itself.","category":"humour","difficulty":1}'::jsonb, 'humour', 1, 'b35a2d85a2f0e6c98f8360801b49f8015a2fb042ebb968a68822a8d16207b5c7'),
('typing', '{"text":"Teamwork makes the dream work, but clear documentation and assigned tickets make sure the dream actually gets built.","category":"office","difficulty":1}'::jsonb, 'office', 1, '223b28c2a06f7432b878219da692d15b31503a6027a5e30904c2c9db6a897d0a'),
('typing', '{"text":"The best part of working from home is that my commute only involves walking three steps past a very sleepy cat.","category":"humour","difficulty":1}'::jsonb, 'humour', 1, '626bdda5ab024e2165255003b36d31508f4ee072a7c12de17321a3f1a98c1547'),
('typing', '{"text":"Honey never spoils in sealed jars; archaeologists have tasted three-thousand-year-old honey found in Egyptian tombs.","category":"facts","difficulty":1}'::jsonb, 'facts', 1, '4be4f9af9dbdd73678e22b52cc9372e0348a7cff14a539ff2dbeddd989100187'),
('typing', '{"text":"Octopuses have three hearts and blue copper-based blood that helps them survive in freezing ocean depths.","category":"facts","difficulty":1}'::jsonb, 'facts', 1, '83ff5be493a44d34fd8a00143ee6a8baf9b7615cc80c278bcc0cd2e89e98f03f'),
('typing', '{"text":"A group of flamingos gathered together on a lake or tropical island is officially known as a flamboyance.","category":"facts","difficulty":1}'::jsonb, 'facts', 1, '4fbff20dafe11ae6324588204625b12ee0846524fbb3a6b50b72de55cb4da5d3'),
('typing', '{"text":"Bananas are curved naturally because they grow towards the sun against gravity in a process called negative geotropism.","category":"facts","difficulty":2}'::jsonb, 'facts', 2, 'cff7b9cc7377fd864ce6d0d8aaa32213aae53a7cbdfb336044dc41c6e769f474'),
('typing', '{"text":"Wombat droppings are shaped like tiny cubes to prevent them from rolling away when marking their territory on rocks.","category":"facts","difficulty":1}'::jsonb, 'facts', 1, '81e3f6cc78970b78212ddf373848648a6a2260755ad73d6ce3f0e8b6560672fd'),
('typing', '{"text":"The heart of a blue whale is roughly the size of a small golf cart and can weigh well over four hundred pounds.","category":"facts","difficulty":1}'::jsonb, 'facts', 1, 'a62d5f904672c24b25eb431ac7d8662d1ce48ca77c67ce073f06a29239ba8a25'),
('typing', '{"text":"Cleopatra lived closer in time to the launch of the iPhone than she did to the construction of the Great Pyramids.","category":"facts","difficulty":2}'::jsonb, 'facts', 2, 'cce5cbc958d5e6a708edf26eb2af78448c1f9eab858f9c48afb04d1673582c31'),
('typing', '{"text":"Cows have best friends among their herd and become visibly stressed when separated from their favorite companions.","category":"facts","difficulty":1}'::jsonb, 'facts', 1, '5dd8e00657fe72b1b83b6c49aee8eceb1ef75a9ab51aecd9574a6eaf84000d63'),
('typing', '{"text":"Water makes distinct sounds depending on its temperature because cold water is more viscous than steaming hot water.","category":"facts","difficulty":2}'::jsonb, 'facts', 2, '17c65c31e2ff9e500d9a0b99332fc98c4b83d787dcfd8d3e55f7d422dae12f4f'),
('typing', '{"text":"A single day on the planet Venus lasts longer than an entire Venusian year traveling around the Sun.","category":"facts","difficulty":2}'::jsonb, 'facts', 2, 'c41ba13ba90c419dd017bde47c21c40dd27e3ae451500578195de4d2c7206677'),
('typing', '{"text":"How much wood would a woodchuck chuck if a woodchuck could chuck wood? As much as a woodchuck could chuck.","category":"tongue-twisters","difficulty":2}'::jsonb, 'tongue-twisters', 2, '666d22aa20f7c3e7a9feb8473cf97f520f95184169f2866a34b74ae6f7ece35a'),
('typing', '{"text":"Peter Piper picked a peck of pickled peppers. If Peter Piper picked a peck of peppers, where are the pickled peppers?","category":"tongue-twisters","difficulty":2}'::jsonb, 'tongue-twisters', 2, 'c256516be0f353010d8b6f521f7b96d864584c9cf8b074db69c40e88716404cb'),
('typing', '{"text":"She sells seashells by the bright seashore, and the shells she sells surely shine like silver in the morning sun.","category":"tongue-twisters","difficulty":2}'::jsonb, 'tongue-twisters', 2, '8ecd73d2350a165df69b8866f78f8f92938e93ad41e084cc58fe66393e7315f2'),
('typing', '{"text":"Fuzzy Wuzzy was a bear. Fuzzy Wuzzy had no hair. Fuzzy Wuzzy was not very fuzzy at all, now was he really?","category":"tongue-twisters","difficulty":2}'::jsonb, 'tongue-twisters', 2, '65c9affead77074c26c1ec9f7d646ea5d4b84642b953991875900e8b7e9f527d'),
('typing', '{"text":"Six sleek swans swam swiftly southwards, slicing smooth silvery seas silently under the soft sparkling summer sky.","category":"tongue-twisters","difficulty":3}'::jsonb, 'tongue-twisters', 3, '460a4034755a751f429bcb1568b18c9efd4bba92ee1c5930490c6522da85a5d6'),
('typing', '{"text":"Which wristwatches are Swiss wristwatches? The quick brown fox jumped right over the lazy dog without a sound.","category":"tongue-twisters","difficulty":2}'::jsonb, 'tongue-twisters', 2, 'a4f185127f25ab42a13530c998a6218e535b96e414da706f6d3dad6f1ba242fd'),
('typing', '{"text":"Betty Botter bought some butter, but she said the butter was bitter. So she bought a bit of better butter to fix it.","category":"tongue-twisters","difficulty":3}'::jsonb, 'tongue-twisters', 3, 'd944b7259f08e00ae18df4562df589dcad5349045e2ab1c4437433ac7e0ec3a9'),
('typing', '{"text":"I scream, you scream, we all scream loudly for creamy vanilla and dark chocolate strawberry swirl ice cream cones.","category":"tongue-twisters","difficulty":2}'::jsonb, 'tongue-twisters', 2, '24542b9ef34c3af5dcd1282e4a8ab614945c96355a5841f45cb2fc1b0df3d0fb'),
('typing', '{"text":"A black bug bit a big black dog on his big black nose, and the big black dog bled bright blue ink on the floor.","category":"tongue-twisters","difficulty":3}'::jsonb, 'tongue-twisters', 3, '3d4d627072436102c425e855137de5744250eb80e6b21b898430c594c7c34b2f'),
('typing', '{"text":"Can you can a can as a canner can can a can? Quick nimble fingers race across the keys to reach the finish line.","category":"tongue-twisters","difficulty":2}'::jsonb, 'tongue-twisters', 2, '49f19a531cfdaaeb1b196efc1e9317f06316efdf08697d0d76c761e1c6278d93')
on conflict (game, content_hash) do nothing;

-- 3. Robust start_game RPC (never crashes if content bank is empty or low)
create or replace function public.start_game(
  p_room_id uuid,
  p_game text,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_room record;
  v_player_count int;
  v_min_players int := 4;
  v_testing_mode boolean := false;
  v_total_rounds int := 1;
  v_session_id uuid;
  v_turn_order uuid[];
  v_participants uuid[];
  v_needed int;
  v_available int;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;

  if v_room.host_id != v_user_id then
    raise exception 'Only the room host can start the game.';
  end if;

  if p_game not in ('quiz', 'typing', 'reaction', 'pictionary', 'charades', 'wordchain') then
    raise exception 'Invalid game: %', p_game;
  end if;

  v_testing_mode := coalesce((v_room.settings->>'testing_mode')::boolean, false);
  v_min_players := case when v_testing_mode then 2 else 4 end;

  -- Select active connected participants (last_seen within 25 seconds)
  select array_agg(user_id order by random()), count(*)
  into v_turn_order, v_player_count
  from public.room_players
  where room_id = p_room_id
    and is_spectator = false
    and last_seen_at >= (clock_timestamp() - interval '25 seconds');

  if v_player_count < v_min_players then
    raise exception 'Need at least % connected players to start (currently % connected).', v_min_players, coalesce(v_player_count, 0);
  end if;

  v_participants := v_turn_order;

  -- Configure total rounds (Section 3 specs)
  if p_game = 'reaction' then
    v_total_rounds := coalesce((p_options->>'rounds')::int, 7);
    if v_total_rounds < 5 or v_total_rounds > 10 then v_total_rounds := 7; end if;
  elsif p_game = 'typing' then
    v_total_rounds := coalesce((p_options->>'rounds')::int, 3);
    if v_total_rounds < 1 or v_total_rounds > 5 then v_total_rounds := 3; end if;
  elsif p_game = 'quiz' then
    v_total_rounds := coalesce((p_options->>'rounds')::int, 10);
    if v_total_rounds < 5 or v_total_rounds > 20 then v_total_rounds := 10; end if;
  elsif p_game in ('pictionary', 'charades') then
    declare
      v_cycles int := coalesce((p_options->>'cycles')::int, case when v_player_count <= 4 then 2 else 1 end);
    begin
      if v_cycles < 1 or v_cycles > 3 then v_cycles := 1; end if;
      v_total_rounds := v_player_count * v_cycles;
    end;
  elsif p_game = 'wordchain' then
    v_total_rounds := coalesce((p_options->>'rounds')::int, 3);
    if v_total_rounds < 1 or v_total_rounds > 5 then v_total_rounds := 3; end if;
  end if;

  -- Content reservation pre-checks (E-28)
  if p_game = 'quiz' then
    v_needed := v_total_rounds;
    select count(*) into v_available
    from public.content_items ci
    where ci.game = 'quiz'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id);
    
    if v_available < v_needed then
      delete from public.room_content_used where room_id = p_room_id;
      select count(*) into v_available from public.content_items where game = 'quiz';
      if v_available < v_needed and (select count(*) from public.content_items where game = 'quiz') > 0 then
        raise exception 'Needs % Quiz questions, only % unused available', v_needed, v_available;
      end if;
    end if;

    insert into public.room_content_used (room_id, content_id)
    select p_room_id, ci.id
    from public.content_items ci
    where ci.game = 'quiz'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id)
    order by ci.difficulty asc, random()
    limit v_needed;

  elsif p_game = 'typing' then
    v_needed := v_total_rounds;
    select count(*) into v_available
    from public.content_items ci
    where ci.game = 'typing'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id);

    if v_available < v_needed then
      delete from public.room_content_used where room_id = p_room_id;
      select count(*) into v_available from public.content_items where game = 'typing';
      if v_available < v_needed and (select count(*) from public.content_items where game = 'typing') > 0 then
        raise exception 'Needs % Typing passages, only % unused available', v_needed, v_available;
      end if;
    end if;

    insert into public.room_content_used (room_id, content_id)
    select p_room_id, ci.id
    from public.content_items ci
    where ci.game = 'typing'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id)
    order by ci.difficulty asc, random()
    limit v_needed;

  elsif p_game = 'pictionary' then
    v_needed := v_total_rounds * 3;
    select count(*) into v_available
    from public.content_items ci
    where ci.game = 'pictionary'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id);

    if v_available < v_needed then
      delete from public.room_content_used where room_id = p_room_id;
      select count(*) into v_available from public.content_items where game = 'pictionary';
      if v_available < v_needed and (select count(*) from public.content_items where game = 'pictionary') > 0 then
        raise exception 'Needs % Pictionary words, only % unused available', v_needed, v_available;
      end if;
    end if;

    insert into public.room_content_used (room_id, content_id)
    select p_room_id, ci.id
    from public.content_items ci
    where ci.game = 'pictionary'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id)
    order by random()
    limit v_needed;

  elsif p_game = 'charades' then
    v_needed := v_total_rounds * 2;
    select count(*) into v_available
    from public.content_items ci
    where ci.game = 'charades'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id);

    if v_available < v_needed then
      delete from public.room_content_used where room_id = p_room_id;
      select count(*) into v_available from public.content_items where game = 'charades';
      if v_available < v_needed and (select count(*) from public.content_items where game = 'charades') > 0 then
        raise exception 'Needs % Charades prompts, only % unused available', v_needed, v_available;
      end if;
    end if;

    insert into public.room_content_used (room_id, content_id)
    select p_room_id, ci.id
    from public.content_items ci
    where ci.game = 'charades'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id)
    order by random()
    limit v_needed;
  end if;

  -- Create game session
  insert into public.game_sessions (room_id, game, options, started_at)
  values (p_room_id, p_game, p_options, clock_timestamp())
  returning id into v_session_id;

  -- Clear previous submissions and transient records for this room
  delete from public.round_submissions where room_id = p_room_id;
  delete from public.round_strokes where room_id = p_room_id;
  delete from public.round_secrets where room_id = p_room_id;

  -- Build initial game state
  update public.rooms
  set status = 'in_game',
      current_game = p_game,
      phase = 'countdown',
      phase_started_at = clock_timestamp(),
      phase_ends_at = clock_timestamp() + interval '3 seconds',
      version = version + 1,
      last_active_at = clock_timestamp(),
      game_state = jsonb_build_object(
        'game', p_game,
        'settings', p_options,
        'sessionId', v_session_id,
        'round', 1,
        'totalRounds', v_total_rounds,
        'turnOrder', to_jsonb(v_turn_order),
        'participants', to_jsonb(v_participants),
        'raw', '{}'::jsonb,
        'arcade', '{}'::jsonb,
        'history', '[]'::jsonb,
        'current', '{}'::jsonb
      )
  where id = p_room_id;

  return jsonb_build_object(
    'success', true,
    'game', p_game,
    'total_rounds', v_total_rounds,
    'session_id', v_session_id
  );
end;
$$;
