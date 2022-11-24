window.addEventListener('load',function(e)
{

   

    const searchButton = document.querySelector('#searchButton');
    const form = document.querySelector('form');

    form.addEventListener('submit', function(e)
    {
        e.preventDefault();

        const searchInput = document.querySelector('.search-input').value.trim();
        console.log(searchInput);



        fetch(`https://api.tvmaze.com/search/shows?q=${searchInput}`)
        .then((data)=>{
            return data.json();
        })
        .then(function(data){
            console.log(data);

            let output='';

            data.forEach(element => {

                const w = element["show"]["image"]

                if(w !== null || w !== "")
                {
                    //! Review
                    $(document).ready(function(){
  

      
                        // Click event handler for the 'show' button
                        $( "#searchButton" ).click(function() {
                        
                          // Fade in the element
                          $( ".custom-card" ).fadeIn();
                          
                        });
                      
                      }); 
                    output +=`
                 

                    <div class="mt-5 card custom-card border-primary mb-3" style="max-width: 20rem;">
                        <div class="card-header text-center"><span class="badge bg-info">${element.show.name}</span></div>
                        <div class="card-body">
                            <h4 class=" text-center card-title"><img src="${element.show.image.medium}" alt="img"></h4>
                            <p class=" text-center card-title"><span class="badge bg-info">Genre: ${element.show.genres}</span></p>
                            
                           
                        </div>
                        <div class="card">
                        <div class="card-body mt-4">
                            <h4 class="card-title">Card title</h4>
                            <a href="#" class="card-link">Card link</a>
                            <a href="#" class="card-link">Another link</a>
                        </div>
                        </div>
                    </div>
    
                    `;
                }




                
                
            });
            document.querySelector('.display-data').innerHTML = output;
            form.reset();
        })
        .catch(function(err){console.log(err);})


        //  https://api.tvmaze.com/search/shows?q=girls



    })// on click event



})//window load