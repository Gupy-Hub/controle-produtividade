MinhaArea.Assertividade = {
    carregar: async function() {
        const periodo = MinhaArea.getPeriodo();
        
        try {
            // Tenta buscar a meta global mais recente definida para este mês
            const { data } = await MinhaArea.supabase
                .from('metas_assertividade')
                .select('valor_minimo')
                .lte('data_inicio', periodo.fim) // Começou antes do fim do mês
                .order('data_inicio', { ascending: false })
                .limit(1);

            const display = document.getElementById('assert-meta-display');
            if (data && data.length > 0) {
                display.innerText = data[0].valor_minimo + "%";
            } else {
                display.innerText = "Não definida";
            }
        } catch (e) {
            console.warn("Erro ao buscar meta assertividade:", e);
        }
    }
};