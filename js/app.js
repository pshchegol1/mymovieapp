// --- Trailer Button Logic: Open YouTube Search in New Tab ---
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('watch-trailer-btn')) {
    const title = e.target.getAttribute('data-title');
    const query = encodeURIComponent(title + ' official trailer');
    window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
  }
});
// --- Entertaining Content Logic for Sidenav ---
window.addEventListener('DOMContentLoaded', function() {
  // Fun facts and quotes arrays
  const funFacts = [
    'Did you know? The longest movie ever made is over 85 hours long!',
    'The first feature-length animated movie was made in 1917.',
    'James Cameron drew the sketch of Rose in Titanic himself.',
    'The sound of the velociraptors in Jurassic Park is actually tortoises mating.',
    'Psycho was the first American film to show a toilet flushing.'
  ];
  const quotes = [
    '"May the Force be with you."',
    '"Here\'s looking at you, kid."',
    '"I\'ll be back."',
    '"You talking to me?"',
    '"To infinity and beyond!"',
    '"I\'m king of the world!"',
    '"Why so serious?"',
    '"Houston, we have a problem."'
  ];
  // Set random fun fact
  const factElem = document.getElementById('movie-fun-fact');
  if (factElem) {
    factElem.textContent = funFacts[Math.floor(Math.random() * funFacts.length)];
  }
  // Set random quote
  const quoteElem = document.getElementById('random-movie-quote');
  if (quoteElem) {
    quoteElem.textContent = quotes[Math.floor(Math.random() * quotes.length)];
  }
  // Poll logic (simple local vote count)
  const pollForm = document.getElementById('movie-poll-form');
  if (pollForm) {
    const pollResult = document.getElementById('pollResult');
    let votes = JSON.parse(localStorage.getItem('moviePollVotes') || '{}');
    pollForm.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'submitPoll') {
        e.preventDefault();
        const selected = pollForm.querySelector('input[name="pollGenre"]:checked');
        if (!selected) {
          pollResult.textContent = 'Please select a genre!';
          return;
        }
        const genre = selected.value;
        votes[genre] = (votes[genre] || 0) + 1;
        localStorage.setItem('moviePollVotes', JSON.stringify(votes));
        // Show results
        let resultStr = 'Votes: ';
        ['Action','Comedy','Drama','Sci-Fi'].forEach(g => {
          resultStr += `${g}: ${votes[g] || 0}  `;
        });
        pollResult.textContent = resultStr;
      }
    });
  }
});
// Fetch trending shows and populate carousel
window.addEventListener('DOMContentLoaded', function() {
  // --- Now Playing Marquee Logic ---
  fetch('https://api.tvmaze.com/shows?page=1')
    .then(response => response.json())
    .then(shows => {
      const trending = shows.filter(show => show.image && show.image.medium).slice(0, 18);
      const marquee = document.getElementById('nowPlayingMarquee');
      if (marquee) {
        const titles = trending.map(show => `🎬 ${show.name}`).join('  •  ');
        // Duplicate the titles for seamless looping
        marquee.innerHTML = `<span>${titles}  •  ${titles}</span>`;
      }
    });

        // Also show random movies below the carousel on first load
        fetch('https://api.tvmaze.com/shows?page=1')
            .then(response => response.json())
            .then(shows => {
                // Pagination logic
                const pool = shows.filter(show => show.image && show.image.medium);
                let currentPage = 1;
                const perPage = 8;
                const totalPages = Math.ceil(pool.length / perPage);

                function renderPage(page) {
                    // Pick 8 random shows for the page (no repeats per page, but can repeat across pages)
                    const used = [];
                    let picks = [];
                    let poolCopy = [...pool];
                    while (picks.length < perPage && poolCopy.length > 0) {
                        const idx = Math.floor(Math.random() * poolCopy.length);
                        picks.push(poolCopy.splice(idx, 1)[0]);
                    }
                    let output = '';
                    picks.forEach((show, idx) => {
                        const showImage = show.image ? show.image.medium : './img/noimg.jpg';
                        const genres = show.genres && show.genres.length ? show.genres : ['Unknown'];
                        const rating = (show.rating && show.rating.average !== null && show.rating.average !== undefined) ? show.rating.average : 'Unrated';
                        const summary = show.summary ? show.summary.replace(/<[^>]+>/g, '') : 'No summary available.';
                        const premiered = show.premiered ? show.premiered : 'Unknown';
                        const cardId = `random-modal-${page}-${idx}`;
                        // Animated star rating (0-10 scale mapped to 5 stars)
                        let stars = '';
                        if (typeof rating === 'number') {
                          let sparkle = rating >= 8.5 ? ' sparkle' : '';
                          let starCount = Math.round(rating / 2 * 10) / 10; // 0-5, one decimal
                          for (let s = 1; s <= 5; s++) {
                            if (starCount >= s) {
                              stars += `<i class="fa-solid fa-star${sparkle}" style="animation-delay:${s*0.07}s"></i>`;
                            } else if (starCount >= s - 0.5) {
                              stars += `<i class="fa-solid fa-star-half-stroke${sparkle}" style="animation-delay:${s*0.07}s"></i>`;
                            } else {
                              stars += `<i class="fa-regular fa-star"></i>`;
                            }
                          }
                        }
                        // Animated genre badges
                        let genreBadges = genres.map(g => `<span class="badge bg-info">${g}</span>`).join(' ');
                        // Confetti trigger for highly-rated
                        if (typeof rating === 'number' && rating >= 8.5) {
                          setTimeout(() => { triggerConfetti(); }, 400 + idx * 120);
                        }
                        output += `
                        <div class="modern-card animate__animated animate__fadeInUp" style="animation-delay: ${idx * 0.07}s">
                          <div class="modern-card-img-wrap">
                            <img src="${showImage}" alt="${show.name}" class="modern-card-img">
                          </div>
                          <div class="modern-card-body">
                            <h5 class="modern-card-title">${show.name}</h5>
                            <div class="modern-card-meta">
                              ${genreBadges}
                              <span class="star-rating">${stars}</span>
                              <span class="badge bg-dark">⭐ ${rating}</span>
                              <span class="badge bg-secondary">${premiered}</span>
                            </div>
                            <p class="modern-card-summary">${summary.substring(0, 100)}...</p>
                            <button type="button" class="btn btn-primary btn-sm mt-2" data-bs-toggle="modal" data-bs-target="#${cardId}">More Info</button>
                            <button type="button" class="btn btn-warning btn-sm mt-2 watch-trailer-btn" data-title="${show.name}"><i class="fa-solid fa-play"></i> Watch Trailer</button>
                          </div>
                        </div>
                        <div class="modal fade" id="${cardId}" tabindex="-1" role="dialog" aria-labelledby="${cardId}Label" aria-hidden="true">
                          <div class="modal-dialog" role="document">
                            <div class="modal-content">
                              <div class="modal-header">
                                <h5 class="modal-title" id="${cardId}Label">${show.name}</h5>
                                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                  <span aria-hidden="true">&times;</span>
                                </button>
                              </div>
                              <div class="modal-body">
                                <img src="${showImage}" alt="${show.name}" class="img-fluid mb-2">
                                  <p><strong><i class="fa-solid fa-tags" style="color:#2196f3;"></i> Genres:</strong> ${genres.join(', ')}</p>
                                  <p><strong><i class="fa-solid fa-star" style="color:#ffb300;"></i> Rating:</strong> ${rating}</p>
                                  <p><strong><i class="fa-solid fa-calendar-days" style="color:#8e24aa;"></i> Premiered:</strong> ${premiered}</p>
                                <p><strong>Summary:</strong> ${summary}</p>
                                <a href="${show.officialSite || show.url}" target="_blank" class="btn btn-outline-info btn-sm">Official Site</a>
                              </div>
                              <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                              </div>
                            </div>
                          </div>
                        </div>
                        `;
                    });
                    const display = document.querySelector('.display-data');
                    if (display) display.innerHTML = output;
                    // Animate cards in
                    document.querySelectorAll('.modern-card').forEach((card, i) => {
                        card.style.opacity = 0;
                        setTimeout(() => {
                          card.style.opacity = 1;
                        }, 100 + i * 80);
                    });
                    // Fix for Bootstrap modal triggers (for Bootstrap 4, use data-toggle/data-target)
                    document.querySelectorAll('.btn[data-bs-toggle="modal"]').forEach(btn => {
                        btn.setAttribute('data-toggle', 'modal');
                        btn.setAttribute('data-target', btn.getAttribute('data-bs-target'));
                    });
                    // Show pagination nav
                    const nav = document.getElementById('pagination-nav');
                    if (nav) nav.style.display = 'flex';
                }

                function renderPagination() {
                    const nav = document.getElementById('pagination-nav');
                    if (!nav) return;
                    let pagHTML = '<ul class="pagination custom-pagination">';
                    pagHTML += `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link" href="#" data-page="prev">&laquo;</a></li>`;
                    for (let i = 1; i <= totalPages; i++) {
                        pagHTML += `<li class="page-item${i === currentPage ? ' active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
                    }
                    pagHTML += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link" href="#" data-page="next">&raquo;</a></li>`;
                    pagHTML += '</ul>';
                    nav.innerHTML = pagHTML;
                    // Style
                    nav.style.marginTop = '1.5rem';
                }

                function goToPage(page) {
                    if (page === 'prev') page = currentPage - 1;
                    if (page === 'next') page = currentPage + 1;
                    page = Math.max(1, Math.min(totalPages, parseInt(page)));
                    currentPage = page;
                    renderPage(currentPage);
                    renderPagination();
                }

                // Initial render
                renderPage(currentPage);
                renderPagination();

                // Pagination click handler
                document.getElementById('pagination-nav').addEventListener('click', function(e) {
                    if (e.target.classList.contains('page-link')) {
                        e.preventDefault();
                        const page = e.target.getAttribute('data-page');
                        goToPage(page);
                    }
                });
            });
    // Example: Use TVMaze's shows endpoint for trending/popular shows
    fetch('https://api.tvmaze.com/shows?page=1')
        .then(response => response.json())
        .then(shows => {
            // Pick first 15 shows with images
            const trending = shows.filter(show => show.image && show.image.original).slice(0, 15);
            const carouselInner = document.querySelector('#trendingCarousel .carousel-inner');
            const carouselIndicators = document.querySelector('#trendingCarousel .carousel-indicators');
            if (!carouselInner || !carouselIndicators) return;

            let innerHTML = '';
            let indicatorsHTML = '';
            // Fun facts/trivia for slides
            const funFacts = [
              'Did you know? The first movie ever made was in 1888.',
              'The Oscar statuette is officially called the "Academy Award of Merit".',
              'The longest movie ever made is over 85 hours long!',
              'James Cameron drew the sketch of Rose in Titanic himself.',
              'Psycho was the first American film to show a toilet flushing.',
              'The sound of the velociraptors in Jurassic Park is actually tortoises mating.'
            ];
            trending.forEach((show, idx) => {
                const genres = show.genres && show.genres.length ? show.genres.join(', ') : 'Drama';
                const rating = show.rating && show.rating.average ? show.rating.average : 'N/A';
                const fact = funFacts[idx % funFacts.length];
                innerHTML += `
                  <div class="carousel-item${idx === 0 ? ' active' : ''}">
                    <div class="carousel-img-overlay" style="position:relative;">
                      <img class="d-block w-100" src="${show.image.original}" alt="${show.name}" style="height:320px; object-fit:cover; border-radius: 1.2rem 1.2rem 0 0; filter:brightness(0.85);" onerror=\"this.onerror=null;this.src='./img/noimg.jpg';\">
                      <div class="carousel-gradient-overlay"></div>
                      <div class="carousel-badges">
                        <span class="badge badge-pill badge-info"><i class='fa-solid fa-tags'></i> ${genres}</span>
                        <span class="badge badge-pill badge-warning"><i class='fa-solid fa-star'></i> ${rating}</span>
                      </div>
                    </div>
                    <div class="carousel-caption d-none d-md-block">
                      <h5><i class="fa-solid fa-clapperboard"></i> ${show.name}</h5>
                      <p style="font-size:1.1rem;"><i class="fa-solid fa-lightbulb"></i> ${fact}</p>
                    </div>
                  </div>
                `;
                indicatorsHTML += `<li data-target='#trendingCarousel' data-slide-to='${idx}'${idx === 0 ? ' class="active"' : ''}></li>`;
            });
            // Carousel autoplay and pause on hover
            $(document).ready(function(){
              $('#trendingCarousel').carousel({
                interval: 3500,
                pause: 'hover',
                ride: 'carousel'
              });
            });
            carouselInner.innerHTML = innerHTML;
            carouselIndicators.innerHTML = indicatorsHTML;
        })
        .catch(err => {
            // fallback: do nothing, keep static images
            console.error('Failed to load trending shows for carousel', err);
        });
});
window.addEventListener('load',function(e)
{

    $('#myModal').on('shown.bs.modal', function () {
        $('#myInput').trigger('focus')
        
      })


    const form = document.querySelector('form');

    form.addEventListener('submit', function(e)
    {
        e.preventDefault();

        const searchInput = document.querySelector('.search-input').value.trim();
        let display = document.querySelector('.display-data');
        const nav = document.getElementById('pagination-nav');

        // Validation: empty input
        if (!searchInput) {
          display.innerHTML = `<div class="search-warning-banner animate__animated animate__fadeInDown" style="background:linear-gradient(90deg,#ffb300 0%,#ff7043 100%);color:#fff;padding:1.1rem 1.5rem;border-radius:1.2rem;margin:1.5rem auto 2.5rem auto;max-width:28rem;text-align:center;font-size:1.18rem;font-weight:600;box-shadow:0 4px 24px 0 rgba(255,193,7,0.13);letter-spacing:0.01em;"><i class='fa-solid fa-triangle-exclamation' style='margin-right:0.7rem;'></i>Please enter a movie name to search!</div>`;
          if (nav) nav.style.display = 'none';
          return;
        }

        // Show animated loader (film reel, clapperboard, popcorn)
        display.innerHTML = `
          <div class="animated-loader">
            <div class="loader-film-reel"></div>
            <span class="loader-clapperboard"><i class="fa-solid fa-clapperboard"></i></span>
            <span class="loader-popcorn"><i class="fa-solid fa-popcorn"></i></span>
          </div>
        `;
        if (nav) nav.style.display = 'none';

        fetch(`https://api.tvmaze.com/search/shows?q=${searchInput}`)
        .then((data) => {
            return data.json();
        })
        .then(function(data) {
            console.log(data);

            let output = '';
            data.forEach((element, idx) => {
                const show = element.show;
                const showImage = show.image ? show.image.medium : './img/noimg.jpg';
                const genres = show.genres && show.genres.length ? show.genres.join(', ') : 'Unknown';
                const rating = (show.rating && show.rating.average !== null && show.rating.average !== undefined) ? show.rating.average : 'Unrated';
                const summary = show.summary ? show.summary.replace(/<[^>]+>/g, '') : 'No summary available.';
                const premiered = show.premiered ? show.premiered : 'Unknown';
                const cardId = `show-modal-${idx}`;

                output += `
                <div class="modern-card animate__animated animate__fadeInUp" style="animation-delay: ${idx * 0.07}s">
                  <div class="modern-card-img-wrap">
                    <img src="${showImage}" alt="${show.name}" class="modern-card-img">
                  </div>
                  <div class="modern-card-body">
                    <h5 class="modern-card-title">${show.name}</h5>
                    <div class="modern-card-meta">
                      <span class="badge bg-info">${genres}</span>
                      <span class="badge bg-dark">⭐ ${rating}</span>
                      <span class="badge bg-secondary">${premiered}</span>
                    </div>
                    <p class="modern-card-summary">${summary.substring(0, 100)}...</p>
                    <button type="button" class="btn btn-primary btn-sm mt-2" data-bs-toggle="modal" data-bs-target="#${cardId}">More Info</button>
                    <button type="button" class="btn btn-warning btn-sm mt-2 watch-trailer-btn" data-title="${show.name}"><i class="fa-solid fa-play"></i> Watch Trailer</button>
                  </div>
                </div>
                `;
                // Append modal HTML outside the card for Bootstrap 4 compatibility
                output += `
                  <div class="modal fade" id="${cardId}" tabindex="-1" role="dialog" aria-labelledby="${cardId}Label" aria-hidden="true">
                    <div class="modal-dialog" role="document">
                      <div class="modal-content">
                        <div class="modal-header">
                          <h5 class="modal-title" id="${cardId}Label">${show.name}</h5>
                          <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                          </button>
                        </div>
                        <div class="modal-body">
                          <img src="${showImage}" alt="${show.name}" class="img-fluid mb-2">
                          <p><strong>Genres:</strong> ${genres}</p>
                          <p><strong>Rating:</strong> ${rating}</p>
                          <p><strong>Premiered:</strong> ${premiered}</p>
                          <p><strong>Summary:</strong> ${summary}</p>
                          <a href="${show.officialSite || show.url}" target="_blank" class="btn btn-outline-info btn-sm">Official Site</a>
                        </div>
                        <div class="modal-footer">
                          <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
            });
            display.innerHTML = output;
            // Animate cards in
            document.querySelectorAll('.modern-card').forEach((card, i) => {
                card.style.opacity = 0;
                setTimeout(() => {
                  card.style.opacity = 1;
                  // Animate stars
                  card.querySelectorAll('.star-rating .fa-star.sparkle').forEach(star => {
                    star.classList.remove('sparkle');
                    void star.offsetWidth;
                    star.classList.add('sparkle');
                  });
                }, 100 + i * 80);
            });
            // Confetti animation logic
            function triggerConfetti() {
              if (document.querySelector('.confetti')) return; // Only one at a time
              const confetti = document.createElement('div');
              confetti.className = 'confetti';
              for (let i = 0; i < 32; i++) {
                const piece = document.createElement('div');
                piece.className = 'confetti-piece';
                piece.style.left = Math.random() * 100 + 'vw';
                piece.style.background = `hsl(${Math.random()*360},90%,60%)`;
                piece.style.animationDelay = (Math.random() * 0.7) + 's';
                confetti.appendChild(piece);
              }
              document.body.appendChild(confetti);
              setTimeout(() => { confetti.remove(); }, 2000);
            }
            // Fix for Bootstrap modal triggers (for Bootstrap 4, use data-toggle/data-target)
            document.querySelectorAll('.btn[data-bs-toggle="modal"]').forEach(btn => {
                btn.setAttribute('data-toggle', 'modal');
                btn.setAttribute('data-target', btn.getAttribute('data-bs-target'));
            });
            form.reset();
            // Hide pagination nav on search
            if (nav) nav.style.display = 'none';
        })
        .catch(function(err){console.log(err);})


        //  https://api.tvmaze.com/search/shows?q=girls



    })// on click event



})//window load

